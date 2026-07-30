# The Far Carry (repo: `Golf-Stars`) — working notes for Claude

> **"COLLECTS NOTHING" IS A PROPERTY OF THE CODE, NOT A PARAGRAPH IN A FILE** (GS-license-privacy,
> `PRIVACY.md` · `tests/privacy.test.ts`). The game ships **© Vulpecula Games, all rights reserved**
> (`LICENSE` — public repo so it can be READ, not a licence to reuse). It stores five `fc_*` blobs on
> the player's own device and **transmits nothing**: no accounts, analytics, telemetry, ads, cookies
> or crash reporting. The guard fails the build on a `fetch`/beacon/`document.cookie` in `src/`, on an
> analytics-shaped dependency, and — the direction that actually rots — on a storage key that exists
> in the code but is **missing from PRIVACY.md's table** (and vice-versa, so the table can't document
> a key that was deleted). If one of those fails, the fix is a DECISION — undo it, or update the
> document — never a relaxed test: a privacy policy that has quietly become false is worse than none.
> ⚠️ The BUILT bundle does contain `fetch`/`document.cookie` (Vite's modulepreload polyfill +
> Capacitor's unused HTTP/Cookies shims) — dead code the game never calls, which is why the guard
> scans `src/` and the document *names them* rather than claiming the bundle is clean. **Crash
> reporting stays local by design**: the deterministic seeded sim means a seed + build number IS the
> bug report, and it beats a minified stack trace from an SDK — see `GS-crash-diagnostics`.

> **THE PRODUCT NAME IS A LABEL; A PERSISTED STRING IS A CONTRACT — AND THE RENAME BEAT THE
> CONTRACT BY ONE RELEASE** (GS-release-identity, `src/brand.ts` · `src/save/legacyKeys.ts`). The
> game ships as **The Far Carry**, and the persisted names moved WITH it, once, pre-launch:
> `fc_save`/`fc_story`/`fc_settings`, `BACKUP_KIND` = `'far-carry-backup'`, the `far-carry-`
> service-worker cache prefix. That was free only because nobody was holding the contract yet —
> **after launch it is not, and this must never happen again.** Every read path ACCEPTS the old
> spelling (`legacyKeyFor`, `LEGACY_BACKUP_KIND`) so the handful of pre-rename devices lose
> nothing; every write is canonical. Old input, new output — the same shape `migrateCampaignStore`
> and the v1→v2 bundle fold already use. Nothing new may join `legacyKeys.ts`: a second legacy
> namespace means the rename happened twice, which is a decision to revisit, not a case to handle.
> The repo, npm package, module names and the Capacitor `appId` (`com.foxorama.golfstars`, a
> PERMANENT package identifier) deliberately keep the old spelling — they are invisible to players.
> ⚠️ **The SW cache prefix is ONE decision written in THREE places that cannot share a constant**
> (`public/sw.js` ×2 + index.html's foreign-cache sweep, which runs before any module): disagree and
> the page DELETES ITS OWN offline cache every boot while believing it is tidying up after a sibling
> app. Every
> user-facing surface reads `GAME_TITLE`/`GAME_TITLE_UPPER`/`APP_VERSION` — never a literal, or a
> future rename half-lands (it was a bare literal in six places). `APP_VERSION` comes from
> package.json via a Vite `define`; the BOOT WATCHDOG cannot import, so it gets the same version
> through a `%GS_VERSION%` placeholder substituted by `transformIndexHtml` (it used to be a
> hand-bumped constant, and a constant somebody must remember to bump eventually lies about which
> build the player is looking at). The intro cinematic RASTERISES the wordmark, so its length is
> load-bearing: `fitTitlePx` shrinks the face until it fits the design frame — `THE FAR CARRY`
> measured **918px against a 904px budget** at the composed 116px, i.e. the fit is not defensive.
> Guarded by `tests/brand.test.ts`.

A travelling space golf **RPG**. You voyage the galaxy; each stop is a procedurally-generated,
ever-wilder golf course (rarity-graded loot). Play it, earn rewards, upgrade your bag/ship/perks,
travel further as difficulty and absurdity scale. A **game**, not a tracker — its currency is
*feel, fairness, and progression*, the opposite of a realism app.

Seeded from `golf-finder` (a separate, real golf+astronomy PWA): we harvested its golf sim, rarity/
card system, hole renderer, and Flux art pipeline, then cut all real-world plumbing (GPS, OSM,
weather, real astronomy). **The two projects are independent. Do not re-couple them.**

> **This file is the constitution — the rules that constrain *new* work.** The deep per-feature
> rationale ("why GS-cetus carves the river that way") lives in `docs/decisions/*.md`, one file per
> domain. When you touch a system, skim its constitution bullet here, then **open the matching
> archive doc for the full history before you change load-bearing code** — the bullets below are
> deliberately terse; the archive holds the why, the failure modes, and the tuning history.
> **Keep this file lean** — when you ship a feature, the durable *invariant* goes here (a line or
> two); the narrative goes in the archive doc. Treat CLAUDE.md like IDEAS.md: scan, rerank, merge,
> retire — **not append-only.** If a bullet here has grown into a paragraph of history, move the
> history to the archive and leave the rule.

## How to work with me (ground rules)
- **Pressure-test my ideas before building them.** If an idea is sound, say so and go. If it
  isn't, push back — question the premise, propose a better alternative, or say "that's not a
  great idea, Dave." A cheerful "yep!" followed by a half-working result is the worst outcome.
- **Implement properly or stop.** If you can't do something well, stop and ask for context or take
  the time to do it right. A "this can't be done cleanly because X — here's what I'd do instead"
  is always welcome.
- **Promote durable knowledge into the repo.** Memory is a private scratchpad; CLAUDE.md, skills,
  and docs are the shared record. When you learn a gotcha or recipe, write it down — the *rule* in
  CLAUDE.md, the *story* in `docs/decisions/`.
- **Be concise, factual, accurate.** State what was verified vs. assumed.
- **Front-load everything; don't drag the session out.** Give all options in one pass; only ask a
  follow-up when the answer changes what you do — otherwise pick the sensible default and say which.
- **One feature per session/PR.** These systems share hot files (`app.ts`, `shot.ts`, `style.ts`,
  `run.ts`); a focused context produces fewer regressions than a marathon. Finish, ship, start fresh.

## Reports & idea backlog (living docs)
- A "report" is a **file**, committed — not a chat message (chat evaporates between sessions).
  End-of-session/one-off reports go in `reports/<topic>-YYYY-MM-DD.md`.
- Keep a living `IDEAS.md` backlog (scan, rerank, merge, retire — not append-only). Stable IDs,
  never reused. Move shipped → Done (link PR), bad → Dropped (say why).

## Three lenses (read every change through these)
This game lives or dies on three axes — put every change through all three before calling it done:
- **Game-feel designer.** The swing, the ball flight, the land, the juice. Readable power/aim,
  satisfying contact, particles and screen-shake that sell impact. Lifeless-but-correct is a bug.
  Ask: does it feel good in the hand, is the loop tight, does each run pull you to the next?
- **QA analyst.** Verify, don't assume. The sim is **pure, deterministic, headless** — so test it:
  simulate whole runs from a seed in `tests/` and assert outcomes. Reproduce any bug by its seed.
  Ship feel/physics tunables behind `window._*` escape hatches so they degrade safely and can be
  A/B'd. State what was verified vs. what needs eyes-on play.
- **Golf-soul keeper (arcade, not sim).** The golf must be *fair and readable* even when the course
  is absurd: wind that reads true off the shot bearing, lie that visibly matters, distances that
  feel honest *within the game's rules*. Wildness is the spice; an unfair or unreadable shot is a
  bug even if the physics are "right." (The inverse of golf-finder's realism dogma — fun and
  fairness beat literal accuracy.)

## Architecture (the locked decisions — see STARTER-KIT for why)
- **Vite + TypeScript, modules, real test runner.** No single-file monolith.
- **Sim ↔ render split.** Everything in `src/sim/` is pure, DOM-free, deterministic, no globals —
  so Node/vitest can simulate the whole game. Rendering reads sim state; never the reverse.
- **Deterministic seeded RNG only** (`src/sim/rng.ts`). `Math.random()` is banned in the sim AND in
  any deterministic render path (scene/SVG) — it breaks reproducible runs, daily seeds, and tests.
  (The ONE sanctioned `Math.random` is `src/app/ctx.ts freshRunSeed()`, side-effect layer only;
  `?seed=` pins it.)
- **Course contract** (`src/sim/course/contract.ts`) is frozen: the generator emits it, the
  renderer consumes it, the sim scores it. Rewrite either side freely behind the contract.
- **Versioned saves from v1** (`src/save/schema.ts`): every persisted blob has a `version` +
  `migrate()` (one step at a time). Namespace keys `gs_*`. Export/import-to-JSON from day one
  (localStorage is the only copy). Current schema is **v33**; bump + add a migration when you
  persist a new field. Loadouts are rebuilt from perk *ids* (`loadoutFromPerks`), so most
  run-state changes need NO save bump.
  **`fc_story` holds ONE CAMPAIGN PER GOLFER** (GS-story-campaign-slots, `sim/rpg/storyRoster.ts` pure ·
  `save/storyStore.ts` the localStorage half): a `CampaignStore` = `{version, campaigns: Record<characterId,
  StoryState>, activeId?}`. One slot per golfer is the ONE decision the whole feature falls out of — four
  golfers ⇒ four campaigns that can't touch each other, a **Star Tour champion IS that golfer's completed
  slot** (never a second copy of a loadout to drift), and "starting over as a golfer you finished with
  replaces your Star Tour character" stops being a rule and becomes a description of overwriting one slot.
  SAME KEY as the old single campaign on purpose: `migrateCampaignStore` **adopts a pre-roster bare
  `StoryState` as a one-slot roster**, so upgrading loses nobody's campaign and the bundle's blob list is
  unchanged. Two traps: `writeStory` READ-MODIFY-WRITES the roster (a write built from stale memory drops
  every other golfer — hence the `storyStore` cache, `invalidateCampaignCache()` after any outside write),
  and it must **NOT move `activeId`** (Star Tour persists the champion it free-roams as after every action;
  moving the pointer would hijack the Continue of a campaign you left mid-chapter — the pointer moves only
  at `openStory` / campaign creation). `activeCampaign` never returns null while campaigns exist — a boot
  path always has an answer; which one to resume is the PICKER's question. Guarded by `tests/story-roster.test.ts`.
  **THE GOLFER PICKER IS THE CAMPAIGN PICKER** (GS-story-campaign-picker) — `openStory` ALWAYS opens the Earth
  clubhouse and each figure wears a campaign TAG (`Chp 3` / `Prologue` / `★ Complete`, and in its accessible
  NAME); tapping a golfer with a campaign CONTINUES it, one without starts theirs, nothing is overwritten by
  picking. **Story-Tour-only by construction**: the `character` screen is SHARED with Voyage/Unending/Star
  Tour, so tags are PASSED IN and a renderer never fetches the roster (absent ⇒ every other mode byte-for-
  byte). The roster lives in `UiState` so the guard on the DESTRUCTIVE write is in the REDUCER, where no
  surface can route around it — `selectCharacter` can never overwrite, `storyRestartCampaign` refuses unless
  `storyOverwriteId` names that golfer, BACK cancels the confirm (tier 0). Confirm copy comes from
  `campaignOverwriteWarning`, the SAME pure function the guard consults, so it can't promise something milder
  than the write. **`currentRoster(state)` is the ONE roster read** — it lays the live `state.story` over the
  boot snapshot, because only the ACTIVE campaign can change while you play; without it the tags would go
  stale unless ~190 `state.story` writes each remembered to mirror themselves. Guarded by
  `tests/story-campaign-picker.test.ts`.
  **A STAR TOUR CHAMPION IS A FINISHED SLOT, AND `starTourUnlocked` IS STILL THE ONLY GATE**
  (GS-story-startour-champions). `openStarTour` reads `championCampaigns(currentRoster(state))` — never
  `state.story`, which is merely whichever campaign is loaded: **0 ⇒ the classic character-first flow
  byte-for-byte, 1 ⇒ straight to the map, 2+ ⇒ the `starTourChampion` picker**. The 0 case is a PROMISE, not
  a fallback: a player who finished under the old single-slot save and then started over holds the permanent
  unlock with an EMPTY roster, and must still get the mode. Champions ENRICH Star Tour; they never gate it.
  The pick is written to `state.story` (so the ~190 readers are untouched), which is safe only because
  `writeStory` doesn't move `activeId`. `championRun` is ONE builder for both entry paths. Yggdrasil is armed
  by `champion || hammer` — but revealing the tree ≠ opening a branch, so the hard hammer gate in
  `playYggdrasilRealm` stays and Asgard renders as *Bifröst sealed* rather than as a dead button. **THE ROOT
  REPLAY TOUCHES NO CAMPAIGN STATE** — a second caller of `mountStoryBattle` (Warden ⇒ Jörmungandr / Herald ⇒
  the Warden Ark, off the champion's `alignment`), landing in `starTourView.serpentResult` and returning to
  the MAP; it needs its OWN reduced-motion branch because the finale's skips by dispatching
  `engageStoryFinale`. That used to be true because there was NO action to dispatch; GS-startour-serpent-
  trophy gave it one, so the guarantee MOVED rather than lapsed — `serpentBout` writes the lifetime tally +
  `ownedShips` and nothing else, and `state.story`/`campaigns`/`run`/`strokePlayBest` come out referentially
  IDENTICAL (asserted on object identity, so a well-meaning `{...state.story}` fails).
  **RECORDS DESCRIBE, THEY DO NOT RANK** (save v31): `StrokePlayRecord.champion` joins `characterId`/`tier`
  as description — one board per course, ranked on to-par alone. Loadout-keyed boards are impossible to do
  honestly (a champion IS the live slot and keeps improving ⇒ no stable loadout identity), and the ★ also
  fixes a real lie — a champion's run is built on `DEFAULT_BAG_TIER` with the story bag laid over, so `tier`
  stamped `common` on a solar bag. Guarded by `tests/startour-champions.test.ts`.
  **FINISHING A CAMPAIGN IS THE ONE PAYOUT THAT OUTLIVES THE SLOT, AND THE ALIGNMENT IS ITS WHOLE KEY**
  (GS-story-champion-cosmetics, `sim/rpg/storyChampionCosmetics.ts`). Every other story reward lands INSIDE
  `fc_story` (`storyRewards.ts`), so one campaign per golfer means starting over ERASES it — and a completed
  campaign wrote just one thing to the main save: `starTourUnlocked`. `CHAMPION_COSMETICS` is a
  `Record<StoryAlignment, …>` the finale win applies to the GLOBAL `ownedShips`/`ownedApparel`: Warden ⇒ the
  Radiant Warden Cruiser + the **Warden Vigil** outfit, Herald ⇒ the Coil Wyrm-Ship + the **Coil Shroud**.
  One campaign can only ever hang ONE set — the other costs a second run, which is the point of The Choice.
  **The ship is the one already earned on that road** (`warden-cruiser`/`wyrm-ship`, already `secret`/free
  rows granted to the CAMPAIGN's garage at the Ch.4 major): granting the same id globally is "you keep it",
  and a bespoke grail hull would cost five compile-forced `Record<ShipLook['kind'],…>` tables for a worse
  story. The outfits are new but INVENT NO PALETTE — Warden white-gold off `wardenArk.ts`, and the Coil
  pieces reuse the DEFECTOR costume's own cobra hood / serpent circlet / open robe panels / ouroboros clasp
  (`storyBetrayal.ts`), worn now by choice. **Idempotent + purely additive** (same array refs when nothing
  is new — the `aceShipUnlock` idiom), a loss grants nothing (incl. `repelled`), and the recap announces
  ONLY genuinely-new ids so re-winning reveals nothing. NO save bump (ids into pools that already exist;
  `sanitize` drops unknowns). New rows sit LAST in `APPAREL` so the per-slot `.find(mythic)` invariant still
  resolves to the for-sale 300-shard piece. Guarded by `tests/story-champion-cosmetics.test.ts`.
  **EVERY ROOT ENCOUNTER COUNTS, AND THE TALLY LIVES WHERE A GOLFER PICK CANNOT ERASE IT**
  (GS-startour-serpent-trophy, save v32, `sim/rpg/serpentTrophy.ts`). The champion's Root replay banked
  NOTHING — right for campaign state, wrong for the player's own history. `serpentBouts`/`serpentWins` are
  now a lifetime pair on the MAIN save (beside `lifetimeAces`, never `fc_story`: one campaign per golfer
  means a slot can be started over, and a thousand-fight grind a golfer pick could erase is one nobody
  would run). At **1,000 wins** the secret **Beaten into Submission** hangs THE WORLD SERPENT in the global
  garage — the `aceShipUnlock` idiom (idempotent, additive, same array ref when nothing is new, so the
  reveal fires only on the bout that earned it). WHICH boss is deliberately not part of the key (one fight,
  one place; splitting it would double the cost for a player who finished both paths), and the REDUCED-
  MOTION branch counts too — gating the last cosmetic behind watching a two-minute battle is exactly what
  `accessibility.md` forbids. The ledger shows the COUNT, never the target (a secret must grow without
  announcing itself). A bespoke `ShipLook['kind']` costs rows in FOUR compile-forced `Record` tables (guns /
  star-map weapon / cabin / HUD livery) and is worth it here: the longest grind in the game does not pay out
  a recoloured wagon. Three art rules it learned — the body is ONE spine path with every fin/scute placed at
  a sampled point and ROTATED to the local heading (axis-upright fins read as fir trees on a green road); a
  beast is EDGED IN ITS OWN LIGHT, not the hulls' near-black ink, or it vanishes against space; and the
  market CARD shows only x ∈ [−25,+25], so an over-long hull loses the SKULL (hence one `scale(0.86)` wrap).
  Guarded by `tests/serpent-trophy.test.ts`.
  **ONE PARKED RUN PER MODE, PER GOLFER — AND ONE FUNCTION THAT SAYS WHAT A STATE PARKS**
  (GS-save-slots, save v33, `sim/rpg/runSlots.ts` pure · `ui/resumable.ts` the decision ·
  `docs/decisions/save-slots.md`). `fc_save.activeRun` was ONE snapshot and four modes wrote through it,
  so starting anything discarded whatever else was parked — *"a Voyage with Larry and an Unending with
  Bo"* had never been true and nothing on screen said so. It is now `runSlots`
  (`` `${mode}:${characterId}` `` → snapshot, over voyage | endless | startour) + a `lastPlayed` pointer
  whose mode MAY be `'story'`. **`fc_story` is deliberately NOT folded in** — it already has this shape,
  its own migration, cache and backup handling, and unifying buys tidiness for a risky migration of the
  one blob you least want to touch; so story has a MODE but no SLOT, which is what retires the old *"a
  Story round is NEVER the main-save resumable"* exception rather than patching it. **`resumableState`
  is the non-negotiable single answer** — `persist` and `toTitle` both call it and neither re-derives
  (source-scanned, incl. a ban on `snapshotRun` returning to `persist.ts`): two descriptions of that
  decision is the bug the whole feature exists because of, and the one that cost a parked Voyage every
  time a Story world was played. `runModeOf` checks **`storyRound` BEFORE the format** (a story round is
  played on `STROKEPLAY_FORMAT`, so the format alone files it under Star Tour); `slotTag() === null` is
  the ONE predicate for "nothing worth continuing" that the title card, the picker badge and the parker
  all read, so merely opening the star map can no longer eat the round parked there; and a confirmed
  start-over **empties the slot immediately**, never "when the new run overwrites it" (a fresh Star Tour
  run parks nothing until a course is pinned). The story overwrite guard is PROMOTED to universal —
  `selectCharacter` CONTINUES a golfer who already has a run and refuses to replace one unless
  `slotOverwriteId` names them. **Resume is at the HOLE you were on, in every mode**: one rule, because
  mixed rules lose a player a run in whichever mode they learned second — and it is strictly less
  forgiving than the restart-the-stop resume it replaced. Everything a stop needs is DERIVED, not
  remembered (course from the run; cut + field inside `finishStop`; endless allowance from
  `holesSurvived`; `run.history` already snapshotted) — except the matchplay boss, rebuilt by
  `buildMatch`, which `playInteractive` and the resume SHARE so they cannot drift. ⚠️ A best-ball
  `partnerHoles` cannot be rebuilt (drawn from the PLAY stream, which a resume reseeds): it is padded to
  the right LENGTH with the banked cards, or the array misaligns and every later reveal shows somebody
  else's card. **Every exit says what leaving costs, from `resumePromise`** — `hole` / `world` (a story
  round: campaign saved, round replayed) / `forfeit` (Asgard) — the back confirm AND the settings
  footer, which used to promise something vaguer. Guarded by `tests/save-slots.test.ts`.
  **THIS BUILD NEVER OVERWRITES DATA IT COULD NOT FULLY READ** (GS-save-integrity, `save/integrity.ts` ·
  `save/schema.ts readSave` · `docs/decisions/save-integrity.md`). `migrate()` answered every blob it
  didn't understand with `defaultSave()` — its return type is `Save`, so "I can't read this" had nowhere
  to go — and since `writeSave` couldn't tell, the next ordinary persist wrote that default OVER the real
  save. **One line, three losses**: a save from a LATER build (the Capacitor shell never auto-updates and
  is its own origin, so export→import between two builds is the DOCUMENTED workflow and was a data-loss
  path the moment their schema versions differed); a FOREIGN blob (itch serves every HTML5 game from one
  shared CDN origin, so `fc_save` sits in a bucket shared with the whole platform — the old code read a
  neighbour's data as garbage and overwrote it too); and CORRUPT bytes. `readSave` is the ONE classifier
  and `migrate()` is now a thin wrapper over it, so every caller that can't act on the difference is
  BYTE-FOR-BEHAVIOUR unchanged (pinned against every shape of input — a refactor of that function that
  quietly moves one outcome is a save-losing bug wearing a tidy-up's clothes). A fault puts the save layer
  READ-ONLY: fully playable, persists nothing, a non-dismissible title alert, and `false` from every
  writer — which costs nothing, because callers have handled `false` from the storage-unavailable case
  since v1. **The import is the ONE write allowed through** (deliberate, confirmed, replaces every blob),
  and `applyBackup` must `clearFault()` FIRST or it reports success having written nothing — the same lie
  in the opposite direction. Campaigns fail the OTHER way — `migrateStory` never reads `version`, so a
  newer campaign is silently TRUNCATED and written back (a slow puncture vs the main save's total loss) —
  so `campaignStoreTooNew` refuses those, envelope AND per-slot, since `STORY_VERSION` and
  `CAMPAIGN_STORE_VERSION` move independently. ⚠️ **The rescue download is RAW STORED BYTES, never an
  export**: a normal export is built from `loadSave()`, which under a fault returns the empty default, so
  the button would hand the player a file containing nothing and they'd believe it was a backup — worse
  than offering nothing. NO new key (a quarantine copy would double the blob in a shared quota and owe
  PRIVACY.md a row), no save bump, no new hook. Guarded by `tests/save-integrity.test.ts` +
  `tests/save-integrity-browser.test.ts`.
  **A backup is a BUNDLE, not a save** (GS-save-transfer, `save/backup.ts` pure · `app/saveTransfer.ts`
  the localStorage/DOM half). Progress lives in THREE blobs (`fc_save` + `fc_story` + `fc_settings`) and
  localStorage is per-ORIGIN, so the website and the Capacitor shell (`https://localhost`) cannot see
  each other's saves — export/import is the only bridge, and the only way off a device before an
  uninstall. **A new persisted blob must join the bundle or it is silently lost.** `parseBackup`
  **THROWS** (`BackupError`) on anything untrustworthy — never `importSave`'s swallow-and-return-
  `defaultSave()`, which is right for boot and catastrophic for an import (it would report success
  while wiping a real save). Import is two steps by construction: the pick PARSES + summarises, a
  second tap writes. **`BACKUP_VERSION` is 2** — bumping when `story` became the `campaigns` roster is the
  POINT, not a formality: an older build trips its own `version > BACKUP_VERSION` check and refuses with
  "made by a newer version", whereas smuggling a roster through the old `story` field would have had it
  hand the container to `migrateStory` and restore ONE mangled campaign while reporting success. A v1
  bundle's single `story` folds into a one-slot roster on read, so every backup ever written still
  restores. The import summary NAMES every campaign and marks champions — import replaces the whole
  roster (never merges: a merge has to invent an answer for "both sides have a Feather Fade campaign"),
  so the player must see what is about to go. Guarded by `tests/save-backup.test.ts` +
  `tests/save-transfer-browser.test.ts`.
- **Content as data, not code:** clubs, lies, biomes, items, economy, formats, characters, golfers,
  caddies, ships are tables the sim reads. **New world / item / golfer = a new row, not an engine edit.**
  Cutting/re-spreading the club taxonomy (`src/sim/clubs.ts CLUBS`) looks like a one-line edit but
  fans out to default bags, reward types, carry thresholds + seeded tests, and can quietly fail the
  death-spiral harness — follow `docs/decisions/club-list.md` before touching it.

## Non-negotiable contracts (break one and the suite goes red)
These are the rules every change is measured against. They are *why* the codebase stays testable.
1. **Determinism / byte-for-byte stability.** A new feature must consume **zero extra rng draws** on
   the default (feature-off) path, and must not reorder existing draws — so every existing seeded
   test is byte-identical. Gate new draws behind the feature being armed. The whole test suite is the
   guard; if seeded numbers shift, you changed the stream.
2. **auto ≡ interactive.** The headless auto sim (`playHole`/`playStop`/`simulateRun`) and the
   interactive driver (`takeShot`/`previewShot`) must resolve the *same* shot identically. Any new
   shot mechanic is threaded through **both** under the identical rule, with the player draw first in
   both. Guarded across the suite.
3. **Fairness by construction.** Penalty hazards (water/lava/void) stay CLEAR of the tee→green
   corridor — `validateFairness()` proves it; sanctioned forced-carry crossings are EXEMPTED and
   `validateCrossings()` proves each carryable. `generateCourse` throws on violation. Spice is
   non-penalty lies + tight corridors + doglegs + wind, never an unfair carry.
4. **No death spiral.** At max wildness the balance bar is `toPar/hole < 1.0` (relaxed harness:
   `< 1.15`) with `< 5%` blow-ups, measured on **mean per-stop Stableford** (NOT full-run distance —
   distance is chaotic). Re-run the no-death-spiral harness after any shot/dispersion/generator/
   hazard tuning. A power-up must *raise* mean per-stop Stableford to ship.
   **THE HARNESS MEASURES THE AUTO AI. IT IS A REGRESSION FENCE, NOT A DESIGN AUTHORITY OVER PHYSICS**
   (GS-carry-roll-real). `playCourse` is the headless sim playing itself, and it is *much* weaker than
   a real player — it stalls around hole 40 of the Unending Universe where humans reach 350+. So a
   harness number moving the wrong way is evidence about the AI, never proof that the physics is wrong.
   When honest physics and the fence disagree: **set the physics from the real world, MOVE THE FENCE,
   and record both numbers in the commit.** Degrading the ball flight to flatter a weak AI makes a worse
   game for the humans who actually play it. (The case that settled it: the carry/roll split had a
   driver releasing 25% of its carry — 62 yards — because that was what the AI had been tuned around.
   Setting it from real reference numbers *improved* the harness from 0.8740 to **0.5215** toPar/hole
   and 8.65% to **5.56%** floor-hits, because the AI had been under-CARRYING the whole time. The bar it
   was defending was partly an artefact of the unrealistic split it was gating. Fixing the AI is its own
   job — see `GS-auto-ai-weak` in IDEAS.)
5. **The graphic IS the physics.** `flight.ts` and `shot.ts`'s `SprayShape` are the single shared
   source the sim samples AND the renderer draws — a ball drawn clearing a tree is one the sim let
   through; the spray cone reads exactly the sampled distribution. Never fork them. Ball flight is
   per club FAMILY (`FLIGHT_PROFILES` keyed by `flightClassOf`), a REQUIRED param through every
   consumer — a new club row picks up its flight with zero engine edits; retuning a row is a
   physics change (re-run the harness, contract 4).
6. **Feel lives behind `window._gsFeel`** (and `_gsIntro`/`_gsSpray`/`_gsArt`) escape hatches, read
   through a `typeof window` guard so the sim stays node-pure. Prefer a `_gsFeel` *sub-field* over a
   new top-level `_gs*` flag — a new flag obligates the test-hub sync (below).

## System index — invariants + where the full story lives
Each system below is **one screen of rules**: the invariants that constrain *new* work, plus the
GS-* feature id to grep and the archive doc that holds the deep story. **Every bullet here is the tip
of a documented iceberg — open the matching `docs/decisions/*.md` before you change load-bearing
code.** (The full pre-refactor bullets — the long implementation histories that used to live here —
are preserved verbatim at the bottom of each domain doc under *"Migrated from CLAUDE.md"*.)

- **Generator & sim** — `docs/decisions/sim-generator.md` · `GENERATOR_VERSION` **43**
  - **Content as data.** Biomes are physics-only rows (render palette is keyed by biome id in the
    render layer). A world's whole FEEL is optional `Biome` profile rows, never an engine edit —
    `parMix` / `shapeWeights` / `widthWeights` (par-4/5 land holes only), `roughFill` (a non-penalty
    off-corridor lie on the `:rough:` side stream), `difficulty` (green tilt/complexity/pin vector),
    `greenSize`/`greenAspect`/`greenIrregular`/`greenSlopeMax`. **ALL OPTIONAL and clamped so the
    defaults reproduce the old draws byte-for-byte** — a non-opted world is unchanged; an opted-in
    world reflows (re-run its death-spiral/fairness bars). All 15 rotation worlds now carry distinct
    profiles (GS-biome-profile / GS-biome-variety / GS-biome-difficulty / GS-green-diversity); guarded
    by `tests/biome-*.test.ts`. The neutral default-weights reference world is `asgard-realm`.
  - **Green identity.** Green levers ride the per-hole SIDE streams (`:slope:`/`:contour:`/`:pin:`/
    `:greencomplex:`) or are fixed-draw params, so they perturb ZERO main-terrain draws — EXCEPT
    `greenIrregular` (left per-world). Bigger greens are easier to HIT (auto bars stay green) but
    harder to PUTT (the intended human asymmetry). No penalty hazard ever sits on the putting surface
    (GS-green-clear, `clearVoidHazards`-sibling post-filter; crossings/`validateGreenApproach`
    exempt). The apron FLARES into a varied, usually asymmetric green complex (GS-green-flare, drawn
    from `:greencomplex:`); skipped on lost-rough / ship worlds.
  - **Composition (opt-in).** `course/compose.ts planCourse` (`opts.compose`, run path only) plans a
    par sequence, 1–2 signature holes, adjacent-shape contrast, and a MEAN-PRESERVING difficulty arc.
    `parSequence` (GS-hole-plan) pins an authored routing (static courses only). Absent ⇒ byte-for-byte
    the old IID generator — direct `generateCourse` tests unchanged. Star Tour rows add per-hole
    `wildnessMix` (GS-star-tour-difficulty).
  - **Corridor & AI.** A `ribbon` off a smoothed template centreline; width is a per-hole ARCHETYPE
    (`chooseWidthProfile` → `Hole.widthId`), variety-not-difficulty. The pure, zero-rng reach-AI lives
    in the SHARED `layupTarget`/exec path (auto ≡ interactive): it READS corridor width and lays up out
    of genuine pinches (GS-fairway-width-2), and plays positional golf out of trouble — punch out of
    trees/deep-rough to reachable fairway + dial power down for real short shots (GS-rough-gradient-
    rebalance `recoveryTarget`/`autoShotPower`). Both fire only in tight/chip regimes ⇒ ordinary shots
    byte-identical.
  - **Fairness by construction.** Greens are star shapes r(θ) (pin ≠ centroid). Forced-carry crossings
    are generic penalty bands the carry-aware AI flies off `penalty`; rivers hold the carry width and
    are fair by construction (`riverChannel` clamps, `generateCourse` throws, no retry). Hazards never
    overlap cross-family (`dedupeHazardOverlaps`, zero-rng post-filter; trees exempt). OB =
    stroke-and-distance off the play-bounds box.
  - **Variety ≠ difficulty.** Shape archetypes + drivable par-4s appear at every wildness; difficulty
    rides bend severity / length / rough / green tilt, not which shapes exist. `straightP` RISES with
    wildness so deep stops gain straight breathers, on the fallback picker AND the profiled
    `pickWeightedShape` (GS-variety-3 / GS-variety-4). Lost-rough par 4/5 draw island STORIES; gaps
    floored to `ISLAND_GAP_MIN_YD`, clamped completable (`separateIslandGaps`/`validateIslandHops`).
  - **Added hazards ride SIDE streams** so they perturb zero main draws: rough gradient
    (GS-rough-gradient, `:rough:`), approach defence — front + cross bunkers, non-penalty
    (GS-approach-hazards, `:approach:`), in-fairway water / split fairways that keep the centreline dry
    (GS-fairway-water, `:fwwater:`, `validateInFairwayWater` throws), and **behind-green defence**
    (GS-green-backstop, `:backstop:`). Death-spiral fences relaxed to the
    interim reality with `TODO(GS-rough-gradient)` — re-tighten in the rebalance, never by softening the
    rough. The STRUCTURAL fairness contracts (`validateFairness`/`Crossings`/`Course`) are never relaxed.
  - **GOING LONG IS PUNISHED** (GS-green-backstop). The back of the green used to be free ground: a census
    of 2,250 holes found trees behind a green averaging **0.00–0.12 per hole**, so airmailing an approach —
    the one miss the player fully controls, since long is a club choice — cost nothing but a chip back. A
    dedicated back-arc pass now stands a TREE STAND (scaled by the world's `treeDensity`, so the sparse
    worlds get a snag and the jungle a wall), a BACK BUNKER on the straight-long line, and a patch of the
    world's own DEEP ROUGH — the last of which is what defends a treeless world (links/desert/void/ship).
    Three rules, machine-checked: **everything back there is NON-PENALTY** (long costs a stroke, never a
    lost card — a penalty backstop is a difficulty cliff), it clears the green / approach lane / corridor
    (blob tested at its JITTERED bound, and against the green POLYGON — a max-radius circle rejects most
    of the back arc on a star green), and it draws from its OWN side stream. Measured death-spiral
    neutral (toPar/hole 0.8962 → 0.8958) because the AUTO sim rarely flies a green — this is a punish for
    the HUMAN miss, which is exactly the intent. Guarded by `tests/green-backstop.test.ts`.
    ⚠️ Do NOT test a behind-green rule against ALL hazards in the back arc: penalty blobs legitimately
    sit there from the older sanctioned greenside RING, and ~22% of holes already carry a non-penalty
    blob poking the putting surface from other passes (see IDEAS `GS-green-surface-bite`).
  - **The derelict ship** (void/cetus/derelict are `BALANCE_EXEMPT_BIOMES`) — the big subsystem;
    everything is gated on `biome.walls` so **every other world is byte-identical**. The lesson worth
    carrying: **the DRAWN playable surface IS the physics boundary** (in flight AND at rest), never a
    segment fence — a pre-built wall fence can't contain a ball on a bending/breaking corridor
    (GS-ship-corridor-contain, after five failed "fix the walls" attempts). Straight constant-width
    hallways (GS-ship-corridor); walls stand `WALL_HEIGHT` 72 > the shot-apex cap so nothing clears and
    they block the aim cone; straight-pinball flight + ground pinball roll off the drawn deck
    (`shipFlightPath`/`wallRollBounce`); off-deck is always `shiprough`/`breach` at every wildness
    (`lostRoughMinWild = biome.walls?0:0.55`); breaches are a `voidlost` penalty. Space past the
    bulkheads is a REAL loss (containment only where a wall actually exists). Ship painters live in
    `style/ship.ts` etc.; `breach` is EXCLUDED from the generic `scatterHaz` bucket (else a purple blob
    paints over the acid hole). Guarded by `tests/walls.test.ts` end-to-end drives.
    **THERE IS ONE DESCRIPTION OF WHERE THE DECK ENDS, AND EVERYTHING READS IT** — every derelict bug
    (7 passes now) has been a SECOND description sneaking in. So: the ribbon edges and the bulkhead
    rails come from ONE `ribbonEdges`/`corridorRuns`, fold-spliced for walled holes only
    (GS-ship-corridor-fold — a mitred offset self-intersects at a bend and even-odd `pointInPoly` reads
    the fold as a phantom VOID mid-deck that nothing draws); the aim cone probes the sim's OWN
    `firstSolidDeparture`, never a private predictor (GS-ship-wall-phantom — `wallFlightHit` is deleted;
    it disagreed with the sim on 42% of bounces); and a mid-air carom needs a bulkhead within
    `FLIGHT_BOUNCE_MAX_WALL_DIST` 6, NOT the resting backstop's 22. **Deck ahead on your line is a
    promise the ball flies on** — a departure that resumes on deck is a CARRY (a gap, a cut corner),
    never a bounce. `clearVoidHazards` is an ISLAND-PAD rule: on a walled hole it keeps on-deck penalty
    hazards (GS-ship-breach-restore — it had been deleting 100% of the acid breaches since
    GS-ship-calm-space armed lost-rough at all wildness).
  - **Static courses** (GS-static-courses) — a pinned `StaticCourseSpec` rebuilt on demand through the
    live `generateCourse` pipeline; deterministic within a `GENERATOR_VERSION` (a bump re-rolls it). NO
    course is frozen (the `FROZEN_COURSES` mechanism is kept but unused). A course's identity is a valid
    varied routing in its par band, not a pinned number. The catalogue is a ROW.
  - **Star Tour** (GS-star-tour, format `strokeplay`) — one 18-hole stroke-play round on a player-chosen
    static course, ranked into per-course record boards (`StrokePlayBest` map, save v27). Threaded through
    both drivers (contract 2). **Earth** (GS-earth) is the one EARTH-set course — **St Annette’s Links**, a
    FICTIONAL Scottish links (`earth`/`earth-links`, real gravity, weight 0, pinned par-72 `parSequence`);
    a new archetype = a row in every archetype-keyed table (compile- and test-forced), never an engine fork.
    **Name no real venue, trophy or trademark in shipped STRINGS** — the world may be recognisably Scottish
    links golf, but the course, its features and its landmarks are ours. (Comments are stripped by the
    minifier and don't ship, but a name in a comment is a name that creeps back into a string.)
  - All new generator draws gate on their feature being armed (contract 1).

- **RPG meta-loop** — `docs/decisions/rpg-meta-loop.md`
  - The spine `startRun → [playStop → buy* → travel]*` is pure/deterministic. **Voyage** is the winnable
    3-arc campaign (boss each, `endedReason 'won'`); the **Unending Universe** is the only endless format.
  - **Endless survival** (GS-set-survival, `endless.ts`) is a per-SET cumulative bar: the four-hole
    `Σ(strokes−par)` must clear a set allowance that ramps every two sets (`ENDLESS_SET_STEPS`), reset
    each set — one blow-up hole never ends a run. DEPTH (holes reached) is the SOLE ranked metric (no
    run-total score). WARP fast-forwards only PROVEN holes (`canWarpStop`); warped stops bank no shards.
  - **Fuel:** every jump burns `routeFuelCost` off `Run.fuel` (distance ± the sky's tail/headwind,
    floored 1). ONE rule in `travel` (auto ≡ interactive): a short tank buys the shortfall at the local
    price, tanker events refuel, all-locked ⇒ `'stranded'`, the SECTOR SCAN redraws lanes (escalating
    price, snapshotted). Fuel is drawn ONLY via `render/fuel.ts fuelGaugeHTML`.
  - **Currencies:** per-run **credits** (Pro Shop) vs cross-run **Star Shards** (cosmetics + bag tiers) —
    two separate economies, never cross-tuned. Cosmetics split BUY (Trade Market, global) vs EQUIP
    (Clubhouse, per character); every unlock-gated item hidden until unlockable (one reveal predicate per
    catalogue). Milestone cosmetics are EARN-ONLY; a hole-in-one earns the secret Comet Rider on ANY ace.
    A Trade Market price change with a refund is a save MIGRATION with OLD prices snapshotted in the step.
  - **Ascension** gates unlock permanent bag TIERS + one random club per character clear
    (`ASCENSION_MAX` 15). Per-golfer starting bag rarity is a Clubhouse pick clamped ≤ owned tier
    (GS-wardrobe-bagtier, save v23). Cosmetic apparel slots (incl. the driver-shot-only `driver` skin,
    GS-thor) + the on-course cosmetic BAG ride per-character save maps.
  - **Bosses** play on a separate `:boss` rng and scale with Ascension via `bossEdgeForRun` (the ONE
    source). The three voyage bosses also ESCALATE by arc via `cutBonus`→`arcRank` (GS-boss-escalation);
    rank 0 / A0 / common bag / Arc-I is the classic boss byte-for-byte.
  - **ASGARD interlude** (`docs/decisions/asgard.md`; GS-asgard) — an eagle-or-better on Rainbow Road opens
    the Bifröst to a 9-hole stroke-play tournament vs three `contender` golfers, scaled by
    `warriorsEdge(depth,ascension,voyage)` and tuned per context (`asgardFieldEdge`; edge 0 = base = byte-
    identical). The real run is SUSPENDED (`asgardReturn`), the Asgard run is never persisted; win or lose
    strips the Rainbow Ball, a win banks Thor's Hammer + `talent-odins-favour`.
  - **Travel screen** = ONE full-screen star MAP framed by a sticky **Bridge HUD** (`.gs-bhud*`, NEVER
    the play screen's `.gs-hud`). The frame recolours + reshapes to the flown ship via `hudThemeForShip` →
    `--hud-*` + a `.gs-bhud--<variant>`; a per-fleet livery (bespoke chrome + instrument `deck`) is a
    `SHIP_HUD` table ROW + a `render/hudChrome.ts`/`hudTheme.ts` builder, never a layout edit
    (GS-fleet-bridges / GS-fleet-dashboards; the Infinity Ace is the reference full reskin). The map is
    `pointer-events:none` so taps pass through; tapping a world raises the `laneCard` (world/weather lore +
    Jump). Pure app/render — the `route`/`scanRoutes`/`bank`/`buyFuel` actions are unchanged. Re-shoot
    `scripts/travel-preview.mjs` after touching it.
  - Route choice carries a destination biome + an economy/cut/meta event — **NEVER generation rng**; every
    non-none course effect carries a real play hook drawn + played from the SAME seeded per-kind stream
    (machine-checked). Weather is biome-INDEPENDENT (rides the route event, gated by arc) with a soft
    thematic affinity (`EFFECT_BIOME_AFFINITY`, same draw count). The three lanes land DISTINCT archetypes.
    A `salvage` lane loots a club off a private destination-keyed stream (blind gamble, only raises
    Stableford). Trade tents ring a tradeMarket stop (only the marmot changes the shot). `runEndUpdates` is
    the single run-end source.

- **Competition & leaderboards** — `docs/decisions/competition.md`
  - The field is a deterministic STATISTICAL ghost (`ghostHoleStableford`), not N real ball-sims;
    `competition.ts` is the single source for the drawn board AND real survival.
  - Voyage survival is your POSITION in one persistent field thinning to the final two; the cut thins
    GENTLY to keep variety and converges to 2 only at the final ordinary stop (GS-cut-variety,
    `VOYAGE_SURVIVOR_TARGETS`/`_FLOORS`). Ascension tightens EARLY cuts but can't flatten the curve. Low
    Ascension hands the whole field an `ease` (GS-green-ease, `voyageFieldEase`, faded to 0 by A8) so a
    green-bag even-par player is competitive; the matchplay BOSSES stay the hard climax.
  - `league.ts` imports `run.ts`, never the reverse; the matchplay boss-id resolves in the UI reducer.

- **Caddies** — `docs/decisions/caddies.md`
  - One caddy on the bag; hiring a new one FIRES the incumbent (`Run.firedCaddies`, not a no-op) — the
    rebuild drops the fired perk (GS-caddy-factions). All caddies are LEGENDARY; each folds ONE loadout
    field. THE RULE (machine-checked): every `NAMED_CADDY_IDS` entry surfaces a `caddyEffects` row AND a
    `factions.ts` faction. FACTIONS + REPUTATION are hidden save/UI groundwork (save v21); the sim `buy()`
    only does the fire mechanic (auto ≡ interactive), the UI gates the fire behind confirmation. Credit
    tokens are faction-branded too (GS-credit-factions, `CREDIT_ITEM_FACTION`, machine-checked distinct).
  - Guard redirects + chip-ins add rng ONLY when armed + qualifying; a guard's `side` is a fairway side off
    the centreline, not the shot bearing. A fairway save snaps the ball HOME to the fairway SPINE
    (GS-caddy-snapback, `ShotInput.fairwaySnap`), greenside saves land on the green; guard-less shots pass
    `undefined` ⇒ byte-for-byte, same single draw, resolved in the shared `resolveShot`. On a walled
    derelict a guard save is DECK-aware (GS-ship-wall-caddy). The renderer draws the guard figure once.
  - The **Prognostic Parrot** (GS-caddy-parrot, faction Space Bandits) reuses the SCRAMBLE machinery
    (`loadout.previewScramble`): a best-of-two proc drawn BEFORE the shot in both drivers ⇒ 0 is
    byte-for-byte and it only raises Stableford.

- **Lore / story beats** — `docs/decisions/lore.md`
  - Lore is CONTENT-AS-DATA (GS-lore, `sim/rpg/lore.ts`): a beat is a `LoreEvent` ROW — a pure
    `trigger(ctx)` predicate + presentation; `pickLoreEvent` returns the first UNSEEN triggering beat; a
    new beat is a NEW ROW. A beat can PAY OUT (GS-lore-rewards, `LoreEvent.effects` applied once by
    `dismissLore`, UI-only zero rng — e.g. the secret Firebird ship + parrot foresight). One-off tracking
    is PERSISTED (`SeenLore`, save v28), recorded on dismiss (fires once ever, across every run/mode).
  - The gate `withLoreGate(next)` (`ui/gameUpdates.ts`) wraps every "→ intro" arrival, diverting an unseen
    triggering beat to the `'lore'` screen. Mode-agnostic (derelict via biome, caddy via perks). The screen
    (`app/loreScreens.ts` + `render/loreArt.ts`) uses its OWN `.gs-lore*` prefix, never the play `.gs-hud`.
    Zero sim rng. Guards: `tests/lore.test.ts` + build smoke + save v27→v28.
  - **A story beat declares WHICH ROOM it happens in** (GS-story-beat-venue): every non-venue chapter world is
    a competitive QUALIFYING EVENT, so a beat about the major (the rival waiting at that tee, the Ragnarök
    omens counting Sigils) must gate `storyTournament === true`; road beats (galleries, omens, the crew
    fraying) gate `!storyTournament`. Beats CHAIN only at a Sigil tee-off (`dismissLore` re-runs the gate when
    `run.storyTournament` is set), so the major's pile-up plays out and every other arrival keeps its one-beat
    pacing.
  - **Story-Tour QUALIFYING EVENTS are nine holes, drawn into one of five formats** (GS-story-qualifier-formats,
    `storyQualifierFormats.ts`): single stroke / single Stableford / paired stroke / paired Stableford / paired
    matchplay, a paired event played SCRAMBLE or BEST-BALL. `qualifierPlan` is a pure keyed hash off
    `StoryState.campaignSeed` + the world (zero play-stream rng), so the sheet is FIXED for the campaign and
    SHOWN on the dossier before you fly. The draw sets the FORMAT + PAIRING; the PARTNER is the player's pick
    on the dossier (GS-story-qualifier-partner-pick, the team-Sigil picker's twin, validated in the plan so a
    skipped pick falls back to the drawn suggestion) — so the partner tally records your choices, not dice. A paired event
    arms the EXISTING team-Sigil machinery (`storyTeamFormat`/`storyTournamentPartner`) — never a new shot
    mechanic. Every format resolves to ONE currency (a place in the chapter field) so the top-N gate + record
    are one shape. Format balance is MEASURED (`scripts/qualifier-balance.ts`) and priced by `PAIRING_BAR_SHIFT`
    so variety is never a difficulty dice-roll; a qualifier partner is deliberately WEAKER than a Sigil partner
    (`QUALIFIER_PARTNER_EDGE`) or a best-ball card stops being about how YOU played. A `pair-match` qualifier
    drives the SAME live surfaces as a matchplay Sigil (chip, per-hole panel, mid-round close-out) off ONE
    pure source, `qualifierMatchThrough` — which `resolveQualifierRound` also calls, so live ≡ final by
    construction; the two sources build one shared `LiveMatch` view so there is one renderer, never a fork
    (GS-story-qualifier-match-live). **A world is a qualifying event for exactly ONE Sigil, once you have
    REACHED its chapter** — `isLiveStoryQualifier` is the single predicate that arms the plan at tee-off AND
    records the finish, so a world charted early (`chartChapter`, GS-story-gather-early) plays as plain
    exploration and comes round later as a brand-new event (GS-story-qualifier-chapter-gate). A **map marker
    is a call to action**: an actionable quest outranks the qualifier flag, a "soon" hint never does, and a
    quest holds NO marker until you have carried that friend's bag (GS-story-quest-soon-marker,
    `questBeatPendingReason`).
  - **A ROUND RECAP LEAVES YOU AT THE WORLD YOU JUST PLAYED, AND THERE IS ONE DESCRIPTION OF WHAT A WORLD
    OFFERS** (GS-story-venue-services, `app/storyServices.ts storyRecapServicesHTML` — rendered by BOTH the
    world-clear recap and the Sigil recap, so they cannot drift; every button is gated by the predicate the
    reducer checks). Every Sigil venue stocks a Pro Shop, one is a ship vendor, three host a friend — and the
    major's recap used to cut straight to the clubhouse, so the campaign's biggest payday was followed by a
    flight back across the galaxy to spend it (machine-checked: no venue may stock nothing). **It is a
    DETOUR, not a route** — `storyTournamentResult` is a forward-only beat with a chain still to run
    (ceremony → The Choice / aftermath / interlude), the reason `backIntent` swallows back there, so the
    services return to the RECAP and the shop's "play again" is hidden AND refused on that route. Everywhere
    else a world's services route out to the STAR MAP from every origin (GS-story-shop-routing — the vendor
    shipyard used to send the world-clear recap home to the clubhouse while the shop button above it flew to
    the chart), and a back button **NAMES where it lands** (`storyServiceBackLabel` reads the stored return
    screen; a screen may not write its own claim). Returning to the chart lands on the CHART — clear
    `starTourView.selectedId`, or the dossier sheet you left through re-raises and costs a manual ✕ — and
    BACK closes an open sheet before it leaves the map (`starMapSheetOpen`, a tier-0 `BackContext` flag
    beside `settingsOpen`/`clubPickerOpen`). Guarded by `tests/story-flow.test.ts` + `tests/back.test.ts`.
  - **The Story-Tour betrayal is per-character + foreshadowed** (`docs/decisions/story-betrayal-arc.md`).
    `betrayerId(story)` = the friend standing apart in the PARTNER TALLY — team-Sigil picks (weight 2) plus
    every paired qualifying event (weight 1); the bigger gap, top or bottom, names them and `betrayerOddness`
    says WHY (`tempted` = partnered most, courted / `sidelined` = partnered least, benched). With no qualifiers
    played the tally reproduces the original two-pick rule exactly, so a v6 arc is unchanged. The first two
    Sigil WINS pay the live standing off as a scene (`storyAftermath partnerThreadAftermath`,
    `BETRAYAL_VOICE.enticed/overlooked`, two stages × two flavours × every golfer) — capped at one beat per
    major so the trunk is never spammed. ALL of a friend's betrayal dialogue is ONE
    indexed block, `BETRAYAL_VOICE` in `storyBetrayal.ts` (defection/farewell/confront/corrupt/doubt/distance
    + the pre-Choice `sidelined`/`tempted` + the Herald `heardTheWord` payoff), each around that golfer's Coil relationship (Voss
    or Venoma); `everyGolferHasBetrayalVoice` machine-checks full coverage. The **mid-round omen**
    (GS-story-midround-omen, `storyMidround.ts`) fires ONCE at the Ch.3 major's nine-hole pause — before The
    Choice, both picks locked — diverting `holeComplete` to the shared `.gs-lore*` beat card (`storyMidBeat`,
    `loreBeatHTML`) then on to the halftime pop. A new golfer = new `BETRAYAL_VOICE` rows; never an engine
    edit. Zero sim rng, no `STORY_VERSION` bump (rides `seenStoryBeats`).
  - **The PATH decides who stands beside you, and who speaks** (`storyPartners.ts` is the ONE seam).
    `storyPartnerIds(story)` = your three tour-mates on the Warden/undecided road, the four Coil agents once
    you are the Herald (GS-story-coil-partners — the tour-mates deserted the bag; two of them come for you at
    Ch.5). Same size ⇒ the qualifier draw sheet is byte-for-byte for a Warden campaign; a pure function of
    `alignment` ⇒ the sheet never moves mid-campaign. `storyPartnerName(id)` names ANY partner — golfer, Coil
    agent, Coil champion — so no surface resolves names itself. A Sigil-5 Coil partner must be a champion you
    have actually MET (`metCoilChampions`, GS-story-champion-met — Scorpius is the Ch.4 WARDEN rival and was
    walking into the Herald climax a stranger). A friend who comes as a PAIR speaks the `confrontPair` voice,
    never the lone-champion `confront` lines (GS-story-pair-voice).
  - **A COIL AGENT HAS ONE NAME AND ONE JOB** (GS-story-coil-names / -caddy-read / -caddy-partner). The four
    inner-circle agents are BOTH the Herald caddy roster and the Herald partner pool, so every surface asks a
    seam instead of deriving. They are spoken by their authored `shortName` — `heraldShortName`, and
    `allyName`/`allyShortName` (the ONE ally-name seam) resolve them too: the deck/ship/badge used to plate
    "Sable"/"the Viper"/"Brother"/"Sister" and the quest headline read *"The Shedding — with a"*. The one on
    your BAG is never offered as a playing partner (`availableStoryPartnerIds` — the rule `finaleMatchup`
    already applied to the Ch.5 champion; the DRAW stays on the full pool, so a Warden sheet is byte-for-byte).
    The putt read row NAMES whoever found the line, PROBED off the caddy's own fold (`caddyReadsGreen`) —
    `loadout.greenRead` says a read exists, not whose, so gear/a reward putter reads as "🔮 Line", never as
    the Mole. And **a quest promises what it PAYS** (machine-checked: a non-club reward may not say
    club/wedge/driver/putter/iron — the Shedmaker promised a wedge and handed over hull armour, the Doctor a
    wedge and handed over a ball). Guards: `tests/story-coil-crew.test.ts` + story-qualifier-formats/quests.
  - **Switched sides is SHOWN** (GS-story-defection-clubhouse / GS-story-coil-garb). The defector's Coil
    costume (`corruptedLookOpts`) KEEPS the golfer's own shirt colour + face + hair and layers an open
    serpent robe + raised cobra hood + serpent circlet OVER it (`golferPreviewSVG`'s `coilGarb` opt), so
    they still read as themselves — a far stronger betrayal than the old flat-violet reskin (the
    `COIL_FIGURE_TINT` hue-shift is retired). Once **The Defection** interlude plays
    (`betrayerHasDefected` = `seenStoryBeats['interlude-warden']`), the Warden-path betrayer is GONE from the
    clubhouse deck AND the ship lounge (you can't talk to them anywhere) — their hat lies abandoned on the
    clubhouse floor where they stood, until you face them, corrupted, at the Ch.5 shrine. Pure render +
    predicate; zero sim rng, no save bump. Guards: `tests/story-betrayal.test.ts` + `tests/story-cast.test.ts`.
  - **THE PROTAGONIST'S GENDER IS THE PLAYER'S, AND NO COPY MAY ASSUME IT** (GS-story-neutral-address).
    The hero is a PICK — Feather she/her · Woo he/she/they · Larry he/him · Bo they/them — so a line that
    genders them misgenders somebody. `storyCast.ts`'s first-person rule only covers how a character speaks
    about THEMSELVES; the gap was how they speak TO YOU, and three shipped: Woo's `overlooked` beat
    ("Big man's got a big round"), Venoma's Herald welcome TITLED "Welcome, Sister", and the Parrot's bar
    greeting ("A captain should know his crew"). TWO SHAPES to watch — a gendered **VOCATIVE** aimed at the
    player, and a **GENERIC MASCULINE** on an indefinite role the player occupies (*a captain*, *a golfer*).
    Third-person copy ABOUT an NPC is correctly gendered and STAYS (Voss, Brother Ouros, Sister Ecdysis, and
    Dan's ship "the old girl" — a vessel, not a person). Machine-checked by `tests/neutral-address.test.ts`
    in three passes: a WALK of the betrayal-voice accessors (what renders, fallbacks included), a vocative
    SCAN of the story/lore modules' source (a row nobody wired an accessor for — bug two was a beat TITLE),
    and a generic-masculine SCAN of the WHOLE sim/app/render surface (bug three was in the bar, not a beat).
    Exceptions are an allowlist that NAMES whose line each one is — if you add one, say who.

- **Putting** — `docs/decisions/putting.md`
  - Manual pace-meter by default; AUTO only via the Penelope Putter caddy (`takePutt(…, control?)`;
    none → `onePutt`, byte-for-byte). The make band shrinks with distance past `puttRange`; the drawn band
    matches. The break line stops dead at the confident read (`puttSkillOf`, cap 1.0).
  - **Backspin is OPT-IN** (GS-backspin-optin): the wedge branch of `clubRollFraction` tapers +5%→0% (a
    check-to-a-stop, never negative); a negative roll comes ONLY from a spin BUILD (Backspin Bo's
    `rollFracDelta` or `backspinBoost` gear). Pure physics change, zero extra draws.
  - **Carry / roll split** (GS-carry-rollout-split): the ball flies a family `carryFrac` and runs the rest,
    total-PRESERVING (endpoint unchanged ⇒ death-spiral neutral). Lives in `flight.ts`
    (`flightScaleFor`/`rollFractionFor`); wedge/putter `carryFrac` 1 ⇒ backspin/putting byte-for-byte.
    **The one fairness coupling: the carry-aware AI keys off FLIGHT reach** (`maxFlightReachOf`), never
    total — a forced carry must clear in the AIR. REACH decisions (green/position) still key off total.
    **A CLUB'S NUMBER IS ITS NOMINAL CARRY, NOT ITS TOTAL, AND THERE IS ONE FUNCTION THAT SAYS SO**
    (GS-carry-roll-real, `clubTotalReach`). The split is anchored on the legacy roll, so the ball FINISHES
    at `number · (1 + legacyRollFraction)` — a 250-yard driver runs out to 295. A reach model built on the
    bare number is therefore a CARRY model wearing a total's name, and `flightScaleFor` overtakes it the
    moment `carryFrac` passes `1/(1+legacyRoll)` = **0.847**: the old driver sat at 0.80 and hid it, the
    real-golf 0.922 exposed it, and `maxFlightReachOf` (258) came out LONGER than the `maxReachOf` (237)
    it is supposed to sit inside. Downstream that inverted pair aimed the default straight into a lava
    river. Both models now build on `flightScaleFor` × `rollFractionFor`, so flight/total is exactly
    `carryFrac ≤ 1` and they cannot invert again. **A test that compares a club's number against a
    required CARRY is asking the wrong question** — measure the flight (`flightCarryScale`), or the
    assertion is too lax below 0.847 and too strict above it.
  - **THE DEFAULT AIM NEVER POINTS AT A HAZARD, AND THE PRE-ARMED CLUB NEVER FLIES INTO ONE**
    (GS-carry-roll-real, interactive only — the auto path keeps its own `layupTarget`, so determinism is
    untouched). `autoAimTarget` had two ways to hand back a wet target: `clearLine` samples STRICTLY
    BETWEEN its ends, so it says nothing about the station itself (a corridor running into a river has a
    dry approach and a wet landing), and the overshoot fallback returned a raw centreline station
    unchecked. A wet target poisons everything downstream — `forcedCarry` reports "fly the entire way"
    from its line-ends-inside-the-band branch, and the club pick hunts for a club to carry a bank with no
    far side. Both are closed, and when the safe line runs past a drive the aim now backs DOWN the
    corridor to the furthest dry station (`dryStationBefore`) rather than choosing between a wet target
    and an unreachable one. `autoAimClub` then applies ONE rule to every positioning shot — the longest
    club that clears what must be cleared AND lands playable — because an open line is not an empty one:
    the target may be a lay-up the longest club would fly straight past into the water. A step-down below
    `aiClub` is legal and machine-checked as FORCED (`aiClub` reasons about reaching, never about where
    the ball comes down; 3 step-downs in 1,083 tee shots, all forced). Measured across 3,072 par-4/5 tee
    shots: wet targets 74 → **0**, wet full-swing landings 22 → **0**, carries short of the far bank
    **0**, driver still pre-armed on 99% of forced carries.
  - **A CADDY-GRANTED OUTCOME STILL HAS TO BE TRAVELLED** (GS-chipin-roll). Dr Chipinski's chip-in set
    `ballAfter = pin(hole)` and left `rest`/`rollPath` at the natural resting spot, so the drawn ball
    stopped **3.0–5.8yd from a cup of radius 1.2** and the hole-out FX fired on bare ground. The branch
    now appends a `chipInPath` trickle — a quadratic Bézier BOWED by the green's own perpendicular slope
    (`greenSlopeAt`, the field that breaks a putt), so it curls instead of tracking like a magnet — and
    sets `rest` = cup with `roll` = the WHOLE arc, positive (the journey ends forward, in the hole, so a
    chip-in is walked forward and never as a check). Zero rng: geometry after the decided outcome.
  - **A SPIN BUILD CAN ONLY SPIN THE CLUBS THAT SPIN** (GS-spin-gate). `rollPotential` subtracted
    `backspinBoost` from EVERY club's roll fraction and never asked `hasBackspin` — the predicate that
    exists for precisely this. Two stacked spin items (0.26 + 0.2 vs a driver's 0.25 run) sent it negative
    and a 250yd drive sucked back to the `−MAX_CHECK` 18yd. Above the PW threshold the spin now bottoms
    out at a DEAD STOP (you bought spin, you gave up your run); PW and below still check, which is exactly
    "the pitching wedge is where backspin starts". The rng draw is consumed either way ⇒ base loadouts are
    byte-for-byte. Both guarded by `tests/roll.test.ts`.
  - The roll/check helper line (GS-runout-line etc.) is the full-shot twin of the putt read, interactive/
    render-only (`backspinRoll` is PURE — the mean roll through the same `rollOut`, so the drawn run IS the
    physics, contract 5). Read range is shoppable gear (`spinReadBonus`/`spinReadFull`, each paired with a
    small `backspinBoost` so auto still gains).
  - **THE SHOT HAS TO ARRIVE** (GS-flight-pace). `flightControl` puts the Bézier's control point ON the
    landing for any shot that finishes on its line, so the curve degenerates to `2t − t²` — ground speed
    `2(1−t)`, i.e. **twice the average at the strike and exactly ZERO at the landing**. Measured on the
    drawn arc: 75% of the ground covered in the first HALF of the animation, 99% by t=0.9, touchdown at
    **2% of average speed**. The ball rocketed off the club and floated down, and every downstream
    number inherited it — the run-out chain starts from the measured arrival speed, so it was faithfully
    continuous from a broken one. `flightGroundAt(u)` spends the animation clock so the GROUND advances
    at a near-constant rate (tapering only as far as `flightDragTaper` — a drive loses a third of its
    horizontal speed, not all of it); arrival speed went 0.0067 → 0.28 yd/ms. Pure pacing: the PATH is
    untouched. `samplePolylineFlight` is exempt — it already walked by arc length, i.e. it was already
    right.
  - **HEIGHT IS A FUNCTION OF GROUND COVERED, NEVER OF THE CURVE'S PARAMETER** (GS-flight-shape). Ground
    and height were on two different clocks — the Bézier's forward progress is `2t − t²` and STOPS DEAD
    at t=1, so as `t→1` the terminal descent angle went to a literal **90°**. A drive glided from its
    apex to 90% of its carry at under 2°, then fell 16.6yd over the last 23: *"it looks buggy as heck,
    not like a real ball flight"*, and the reason GS-landing-real had to dodge "a near-vertical tangent
    artefact". `arcHeight(apex, g, shape)` now takes the GROUND fraction and `flightGroundFrac`/
    `flightParamAt` are the ONE place the two are converted — every walker (sim knockdown, tents, the
    aim overlay's blocked cone, the play animation) works in ground. The arc is two cubic legs pinned at
    both ends in value AND slope: a near-straight lift-supported climb to the apex, then a steepening
    fall onto a real descent angle. Guarded by `tests/flight.test.ts`; eyes-on `scripts/flight-preview.mjs`.
  - **A FAMILY DECLARES THREE PHYSICAL LEVERS AND EVERYTHING ELSE IS DERIVED** (GS-flight-shape,
    `FLIGHT_PROFILES`): `apexAt`, `dropRatio` (`tan(descent)/tan(launch)`, the drag signature) and
    `launchTrimDeg` on the global loft ramp (`ARC_FEEL`, 11° at 250yd → 27° at 40yd, CURVED by
    `loftCurve` because real launch barely moves across the long clubs). **Apex is NEVER declared** —
    a drag-free projectile peaks at `tan(θ)/4` of its range and a spinning ball beats that by a steady
    `liftGain` 2.35 (tour driver 2.36×, tour PW 2.33×), so a row cannot be handed a launch angle its
    apex contradicts. The shape coefficients derive from the same relation with carry AND apex
    cancelling (`rise = 4·apexAt/liftGain`), which is why the shape is a per-FAMILY constant. Two rules
    the old table had backwards: **the FLATTER club peaks LATER** (driver 0.66, wedge 0.56 — the legs
    split the ground in proportion to how shallow each is), and a LINEAR loft ramp puts the highest ball
    flight in the bag on the HYBRIDS (a 181yd 3-hybrid launched 17.3° and out-flew the driver; a test
    now forbids any club out-flying it). Bag: driver 11°/31yd/38° down · 6i 16.5°/26yd/49° · SW
    26°/21yd/57°. Retuning a row is a physics change (re-run the harness, contract 4) — this pass moved
    it 0.5139 → **0.6319** toPar/hole and 5.66% → **8.09%** floor-hits, both inside their fences, no
    fence moved: a ball that genuinely comes down lets the trees short of a green defend it (knockdowns
    15.72% → 19.03%, entirely in the wooded worlds).
  - **HANG TIME COMES FROM THE APEX, NOT THE CARRY** (GS-flight-hang, `flightDurationMs`). A ball
    launched with vertical speed `v` peaks at `v²/2g` and stays up for `2v/g`, so `t = 2·√(2·apex/g)`
    — **the time comes from the HEIGHT and the carry never enters it.** The animation was keyed on
    carry, and since GS-flight-shape made the apex tour-FLAT across the bag (31yd → 21) that was
    exactly backwards: real hang times run 4.8s for a drive to 3.9s for a sand wedge, a ratio of 1.2,
    while the drawn ratio was **2.15** (816ms → 380). Measured at the cameras the game actually uses,
    a 9-iron crossed the screen at **1.58 px/ms against a driver's 0.53** — three times faster, the
    report *"irons, hybrids and wedges fly too fast in the air"*. It was also most of the TAIL
    complaint: the closing tenth of the ground was spent in **44ms** on a 9-iron against 95 on a
    drive, so the steepest arcs in the bag were also the most rushed. Keying on apex flattens the
    drawn times to 666–814ms; with a per-family `dragTaper` (`FlightProfile`, driver 0.72 → wedge
    0.46 — a lofted club flying slower and steeper sheds proportionally more forward speed, so it
    SETTLES onto the turf instead of arriving at launch pace) the closing tenth lands at **95–108ms
    for every club in the bag**. PURE render pacing: the drawn PATH is untouched, no sim module reads
    `dragTaper`, and the death-spiral harness is byte-identical (0.6406 / 8.02%). Guarded by
    `tests/runout.test.ts`; measured by `scripts/runout-frames.ts`.
  - **THE LANDING IS BUILT FROM THE FLIGHT, NOT A CLASS LOOKUP** (GS-landing-real, `render/runout.ts`
    `Landing`). A hop's LENGTH scales with `carry·cos²(descent)` and its APEX with `carry·sin²(descent)`,
    so how far it flew and how steeply it fell decide the landing: driver 38° down skips 12yd six times,
    a wedge at 57° pops once. Descent is `arrivalAngleDeg` — the fall leg's EXACT terminal slope, off the
    same shared geometry, so it stays honest for a clamped apex, a partial swing and the derelict's
    pinball polyline alike (it replaced a chord over the closing tenth, a workaround for the vertical
    tangent GS-flight-shape deleted; that chord under-read a driver by 3° and a wedge by 9°, and
    re-honesting it forced `hopDrawBoost` 5 → 5.4 to keep the scoring clubs' bounce visible). Three rules: **every airborne shot bounces at
    least once** (wedges planned ZERO hops before — their run is shorter than the old length floor);
    **the hop train can never outrun the sim** (capped so a closing roll always remains, and since the
    sim's own `dist` collapses on soft ground the surface kills the bounce through the physics); and
    **speed is chained** off the arrival. A hop lands ON ground it samples (`firmAt`) so skipping INTO a
    bunker kills the rest of the train. Per-shot variation is a HASH of the shot's own geometry — zero
    rng, zero draws (contract 1) — because an identical bounce every drive is the tell that it is
    animation. `rollEntryFloor` is retired to 0 — flooring an entry speed IS a velocity step. Eyes-on:
    `scripts/landing-preview.mjs`; measured per club/power by `scripts/runout-frames.ts`.
  - **A HOP'S APEX-TO-LENGTH RATIO IS `tan(descent)/4`, AND A FLAT CONSTANT MADE THE BOUNCE SMALLER THAN
    THE BALL** (GS-runout-visible, `apexOverLenFor`). Launch at θ and the projectile travels `v²sin2θ/g`
    while peaking at `v²sin²θ/2g`, so apex/length is `tan(θ)/4` — nothing to tune: a driver at 35° skips
    at **0.18**, a wedge at 62° pops at **0.47**. `apexOverLen` was a flat **0.3** for every club, which
    was simultaneously too generous for the driver AND far too stingy for the wedge — stingy in the one
    place it mattered, because a hop's length is bounded by the sim's ROLL and a checking short iron's
    roll is deliberately tiny, so the cap crushed the apex to nothing and threw away the `sin²(descent)`
    physics `hopApex` had already computed. Measured at the cameras the game actually uses, **18 of 40
    club/power combinations drew a peak bounce of 0.7–2.6px under a ball drawn at 3px** — the ball never
    cleared itself, which is the report *"it just lands and stops or lands and does a flat roll… the
    bounces are not visible"*. (The reported cause — a bounce sized off MAX distance — was not it:
    `carry` is the shot's actual carry and hop length scales with it.) Deriving the ratio dropped the
    driver from 0.3 to 0.18, which bought back the headroom to raise `hopDrawBoost` 3 → 5: the driver's
    DRAWN ratio is `0.18·0.55·5 = 0.48`, within a whisker of the shipped `0.3·0.55·3 = 0.495`, so its
    skip is unchanged while every steep club lifts. **18/40 → 4/40**, and the 4 are dinked 30–56yd
    partials with ~1yd of roll, which is a plop and correctly has no bounce. `hopDrawBoost` must still
    stay modest — height is exaggerated and length is not, so it multiplies the drawn ratio directly and
    a big value turns a skip into a pop-up (the reason it is not simply cranked).
  - **THE GRAVITY CREEP IS ITS OWN EVENT, AND THE SIM IS THE ONE PLACE THAT KNOWS WHERE IT STARTS**
    (GS-roll-hairpin, `ShotLog.creepFrom`). A ball whose roll ends on a steep piece of sculpt trickles on
    down the fall line — a direction that owes NOTHING to the way it was travelling, so it can double
    back by up to **180°**. Drawn as the tail of the roll it inherited the roll's single decelerating
    sweep, so the ball glided straight through the reversal without ever appearing to stop: the report
    *"the ball is doing the weird path roll instead of a curve from last bounce to final lie and it just
    looks buggy as heck"*, and the half of the old "crazed magnet" complaint GS-chipin-roll never reached.
    Measured over 368 real curved rolls a creep fired on **23%**, and **63 of those reversed >40° at the
    join**. The fix is to draw what it is: the run-out plan is built on the ROLL ALONE, then the creep
    plays as its own phase — a `creepPauseMs` beat of stillness so the stop is READ, then a smoothstep
    trickle at `creepMsPerYd` (deliberately slower per yard than the roll that fed it, because gravity is
    barely moving the ball). **Non-chip-in hairpins 63 → 0.** No `creepFrom` ⇒ one undivided walk, exactly
    as before. The renderer must NEVER re-derive the join — that is the second-description mistake every
    derelict bug was. ⚠️ The CURL was investigated and EXONERATED: its per-step bend never overshoots the
    fall line at the shipped constants, so don't "fix" it. A holed Chipinski chip-in still kinks where its
    trickle joins (GS-chipin-roll chose to walk that straight through) — see IDEAS.
  - **WHAT SHEDS THE BALL AND WHICH WAY IT GOES ARE TWO DIFFERENT QUESTIONS** (GS-creep-fallline). The
    creep read `greenSlopeAt(p, undefined, lobes)` — the SCULPT with no plane — for its DIRECTION as well
    as its arming, making it the one thing on a green moving down a hill that is not the hill the player
    is looking at: the isolines, terrace shading, fall-line arrows, putt break, chip-in bow, roll curl and
    first-bounce deflect ALL sample plane+lobes. Measured over 832 real creeps
    (`scripts/creep-census.ts`), the plane's tilt at the rest point averages **0.546** against the
    sculpt's **0.386**, so the plane usually WINS and the creep ran **60–120° across the drawn contours on
    33%** of creeps and **outright uphill (≥120°) on 14%**, mean disagreement 65° — up to five yards of
    slow, deliberate, wrong-way trickle at the putt camera. The report *"sometimes it rolls straight
    across or against the contours after the backspin and it looks like a proper bug"*: **47% → 0%**, mean
    2.1°. The arming stays the SCULPT (a green's uniform tilt still holds a ball, so the SET of balls that
    creep is unchanged — arming on the full field would have every ball on every tilted green trickling);
    the DIRECTION is the surface (`greenSlopeAt(p, slope, lobes)`), gated by the same `CREEP_MIN` so a
    plane that CANCELS the sculpt leaves the ball at rest rather than creeping down a flat. Zero rng,
    zero fixture re-pins; harness 0.6406 → **0.6358** toPar/hole, 8.02% → **7.95%** floor-hits. ⚠️ The
    census must arm a spin build to see the reported case at all — since GS-backspin-optin a plain wedge
    never checks, so 0 of 5,870 stock auto shots creep after a backspin. Guarded by
    `tests/green-contour.test.ts`. **66% of creeps still stop on the 5yd `CREEP_MAX` budget rather than
    because the ground flattened** (61.7% before, i.e. pre-existing) — the "flow" half of the report, a
    friction-vs-slope tuning question with its own balance run: `GS-creep-friction` in IDEAS.
  - **BOUNCE AND RUN READ PER CLUB  - **THE RUN-OUT HAS ITS OWN TIME BASE, AND PRETENDING OTHERWISE MADE THE BOUNCE INVISIBLE**
    (GS-landing-real, `runoutTimeScale`). The drawn FLIGHT is **~8× real time** — 750ms for a 250yd
    drive that really takes six seconds — so GS-runout-feel's "no velocity step from strike to rest"
    chained the bounce to an 8× arrival speed and made it physically right and visually impossible:
    measured in game, a driver's six hops totalled **87ms**, the first **27ms** = 1.6 frames, drawn lift
    **0.6px**, zero perceptible peaks. GS-flight-pace made it WORSE by fixing the arrival speed. The
    run-out now runs on its own slower base; continuity is kept WITHIN it (hop→hop→roll, and the roll
    enters at the last hop's ACTUAL speed, which `hopMinMs` can stretch below the chained one). Hops
    must also cover real DISTANCE or they are a blip before a long roll — `hopLenK` 0.085→0.16 took the
    driver from 87ms/8% to **868ms/31%** of the run-out. Measured per club, never guessed
    (`scripts/landing-preview.mjs` + a frame-by-frame in-game track).
  - **BOUNCE AND RUN READ PER CLUB, AND THEY COME FROM DIFFERENT PLACES** (GS-runout-club). The RUN is
    the SIM's — `FLIGHT_PROFILES.carryFrac`, total-preserving — and the irons were ONE row at 0.9, so
    every iron ran LESS than a hybrid and a 3-iron was indistinguishable from a 9-iron. `flightClassOf`
    now splits them at the NUMBER (`ironLong` ≤5 / `ironShort`), still convention-based so a new `4i`
    row needs no engine edit (the ladder itself now lives in `runFrac`, GS-runout-ladder below).
    Splitting a class is COMPILE-FORCED
    at every `Record<FlightClass,…>` — audio's strike voice and the shop's "irons" item are still ONE
    thing to the player, so both rows share them. Measured on the death-spiral harness (2,880 holes):
    toPar/hole **0.8958 → 0.8740**, floor-hits **9.48% → 8.65%** — both the safe direction, and the
    blow-up fence is ratcheted to `< 0.09` to hold it. The BOUNCE is render-side (`RUNOUT_BY_CLASS`,
    multipliers on the surface-derived share/restitution/apex): the landing sets the base, the club
    scales it, so a driver skips off a firm fairway and a wedge plops into the same fairway.
    Two bugs fixed in the same pass, both structural: **the backspin check joined a constant-speed skid
    to a smoothstep** — derivative zero at u=0, i.e. full flight speed → dead stop → creep, the reported
    *"stops and then just slides"* — now a cubic Hermite whose start tangent IS the skid velocity; and
    the hop train **handed the REMAINDER to its last hop**, which made the final skip the biggest of the
    tail (13yd after 7yd off a firm driver) — every hop is now a clean geometric share and the leftover
    rolls. **A piecewise run-out must test `ds/dt` across EVERY phase join**: the old suite pinned
    touchdown alone and shipped a hard stop mid-animation. Guarded by `tests/runout.test.ts`.
  - **THE RUN IS ITS OWN LEVER; BUYING IT OUT OF THE CARRY IS NOT A FREE TRADE** (GS-runout-ladder,
    `FlightProfile.runFrac`). The run used to be whatever the flight left over — `(1−carryFrac)/carryFrac`
    — so the only way to make a driver run further was to make it FLY less. Carry is load-bearing in a way
    run is not: it decides whether a forced carry is clearable in the AIR, whether a grove knocks the ball
    down, and (through `arcApex`) how high the ball flies. Buying a 30yd driver run out of the carry
    dropped its flight 272→257, put its apex UNDER a 2-hybrid's (re-creating the very bug GS-flight-shape
    fixed), and left **12 of 573** forced-carry tee drives that NO club in an epic bag could fly, 9 of them
    pre-arming a club that lands wet — reopening what GS-carry-roll-real closed. So `carryFrac` is now
    purely the FLIGHT scale (values UNCHANGED ⇒ zero carry moved, zero knockdown moved) and `runFrac` says
    how far the ball then runs; the club's TOTAL grows by the difference, which is the honest reading (a
    driver carrying 272 and running 38 on firm turf finishes at **310**, and real firm-fairway driving is
    265–270 + 30–40). Ladder: driver 14% ▸ wood 10.5% ▸ hybrid 7.5% ▸ long iron 6.5% ▸ short iron 5.5% ▸
    wedge = the legacy taper (absent `runFrac` ⇒ byte-for-byte, so the backspin build is untouched, and
    the ladder must END above the wedge's 5% peak or a PW outruns a 7-iron). Measured in real play,
    fairway roll: driver 19.4→**28.1**, wood 12.1→**19.8**, short iron 2.6→**5.7**. Two couplings came
    with it, both machine-checked: greens must HOLD (`SURFACE_ROLL.green` 0.7→0.55, else approaches
    release off the back — green-holding fell 28.9%→26.6% before it), and the default aim must never ask
    for a carry the bag cannot FLY (`carryableBefore`, the twin of `dryStationBefore` — positioning
    reasons in TOTAL reach and the longer run moved its station out past unflyable banks). Harness:
    toPar/hole 0.6319 → **0.6406**, floor-hits 8.09% → **8.02%**, both fences unmoved.
  - **A BOUNCE TRAIN THAT COLLAPSES FASTER THAN IT SHORTENS IS SEEN TWICE AND LOST** (GS-runout-ladder).
    Physically a hop's apex decays as `kv²` (~30%/bounce on firm turf) while its LENGTH decays as `kh²`
    (~65%) — both right, and drawn together the height dies more than twice as fast as the ground: the
    driver planned SIX hops and the player saw **TWO**, the rest sub-pixel scuffs under a 3px ball. Height
    is already the exaggerated axis here (`hopDrawBoost`), so it is now exaggerated CONSISTENTLY along the
    train (`hopApex *= kh²`) and each skip is a smaller copy of the last. `kv` still sets the FIRST hop's
    height, so soft ground plops and firm ground skips exactly as before — only the tail survives to be
    seen. With `hopLenK` 0.05→0.07 (a decisive first skip, not a stutter) and `runoutMaxMs` 2400→3100 (the
    longer run was being played at 2× speed), invisible bounces went **6/40 → 3/40** and the three left are
    30–52yd sand-wedge partials with ~1yd of roll, which is a plop and correctly has none.
  - **THE BALL STAYS ON THE SCREEN, AND A SHADOW UNDER THE BALL IS NO SHADOW** (GS-landing-real). The
    play view drew NOTHING once every shot and putt had played, so the ball blinked out and the player
    watched an empty fairway until the screen changed; it is now drawn at rest until unmount (cleared
    on a hole-out — it went IN). And `drawBallShadow` drew concentric with the ball at the same radius,
    so on the ground — most of a run-out — the ball covered it completely: "I can't see any shadows at
    all" was a shadow drawn every frame, underneath the ball. It is now OFFSET down-right off `LIGHT_UL`
    and wider than the ball.
  - **A CADDY CALLS THE SHOT, IT DOES NOT ADJUDICATE IT** (GS-landing-real). Dr Chipinski's "You rang?"
    fired as the ball dropped in, which read as a verdict handed down after the fact — "it feels like
    cheating instead of chipping in". It fires at the STRIKE now and the shot makes good on it.
  - Greens layer 1–2 contour LOBES (`Hole.greenContour`, own side stream) over the plane; `greenSlopeAt` is
    the ONE field the resolver, preview, read AND arrows sample (`sim/contour.ts`). `rollOut` samples it per
    step and CURLS (roll is ARC length; straight-roll invariance holds only on lobe-less holes); the first
    bounce reads the landform and gravity creep forbids resting on a steep sculpt (GS-green-contour-3;
    lobe-less holes byte-identical). Contour ART is a lit relief map in the biome's turf shade; `contoured`
    gates on the ISOLINES, not the fall-line arrows.

- **Render layer** — `docs/decisions/render.md`
  - ONE pure projector (`render/project.ts`) both renderers share; ONE shared scene builder
    (`render/style.ts buildScene` → `Prim[]`), SVG = static map, Canvas2D = animated play view. `style.ts`
    is the ORCHESTRATOR only (GS-style-split): painters live in per-domain `src/render/style/*` and NEVER
    import style.ts (`shared.ts` is the dependency root). **A new painter = a new `style/` module.**
  - **THE MAP IS DRAWN AT THE SCREEN'S SHAPE** (GS-play-fullframe, `project.ts fitFrame`). The scene is
    AUTHORED in a `360×640` design frame (every stroke width / font size / marker radius is a number of
    those units) but never DRAWN at it: `mapFrame()` grows that frame to the container's aspect, keeping
    the meet scale the browser would have picked. A fixed viewBox in an `inset:0` container is
    letterboxed by `preserveAspectRatio`'s default meet fit — 75px of bare page background above AND
    below on a 390×844 phone, reading as black bars wherever no geometry spilled past the frame. Grow the
    frame, never stretch (distorts) or `slice` (crops the ball off a landscape screen); a container
    already at the design aspect is unchanged, so 9:16 is byte-for-byte. ONE fitted frame feeds the map,
    both surgical overlay refreshers, `overlayDecor` and the weather canvas — a re-measure per call can
    straddle a resize and shear the cone off the scene. Guarded by `tests/map-frame.test.ts`.
  - All scene randomness is mulberry32 seeded off `hashHole()` on documented streams; adding a draw must not
    perturb stream order. The scene is CAMERA-PROOF (the follow-cam rebuilds per frame): rng counts never
    read the projection, `posHash` keys are course-space, `archetypeDecor` pushes unconditionally
    (`tests/camera-stability.test.ts`).
  - Rough is the biome's ground COVERING (`GROUND_COVER`); space starts at the OB frame; the land hull sits
    ≥30/255 above its space tone (machine-checked). Over it, `biomeRelief` (`BIOME_RELIEF`, every archetype
    has a row) lays directionally-lit mounds so ground reads as rolling terrain — PURE geometry, zero rng,
    camera-proof (GS-biome-relief). Per-world identity (flora, OB, decor, ambient air, wind tint, water/sand
    palettes) is ALL archetype-keyed table+dispatch (`tests/biome-identity.test.ts` guards full coverage); a
    flora variant consumes EXACTLY the classic two draws.
  - **THE BALL IS A BALL** (GS-ball-art, `render/ball.ts` — pure geometry + spin maths, node-tested;
    painters take a ctx and nothing else). It was `ctx.arc(x,y,3)` filled `#fff` at three sites, at a
    FIXED 3px whatever the camera did — so it could never look like it was ROLLING (a featureless disc
    can't) and the run-out's hops were INVISIBLE (a 3px disc rising 1.5px off a static shadow is not a
    bounce; the model had been hopping the whole time). Three rules: the drawn ball SCALES with
    `proj.scale` **sub-linearly** (`sqrt`) — floored (2.25px, the whole-hole map) and capped (3.3px)
    against the scene's own fixed markers (tee dot r5, flagstick 14 units, the pin's base shadow r2.2),
    and sub-linear because LINEAR growth pinned every putt to the cap: an 18px ball, and flat, so a
    tap-in looked like a 20-footer. **EVERY LENGTH ON THE DRAWN BALL IS ONE SCALE AND THE WHOLE OF IT
    MOVES TOGETHER** — the size has been reported too big twice, and the second time (*"a tennis ball…
    compared to the hole/flag it's a beachball"*, 75% asked for) the radius curve, the feature-onset
    radii (band/mark/`dimpleMinPx`) AND every absolute ink width that rides on it (the rim hairline, band
    width, dimple/mark floors, the aura's outset) went down together. Scale the curve alone and a
    25%-smaller ball keeps a 1px rim on a 4.5px silhouette — a third of it — so it reads MUDDIER rather
    than smaller, and since the rim is stroked ON the silhouette the apparent radius (`r` + half the rim)
    lands at 78%, not 75%. Scaling the onset radii by the same factor is what keeps it the SAME ball: the
    cameras at which dimples/band/mark arrive come out unchanged. The measured cameras are 0.5–5.7 px/yd
    for shots and **7.6–35 for putts** —
    guess them and you tune the wrong end (a real ball is 0.047yd = a THIRD OF A PIXEL at the putt
    camera, so a scale model was never on the table); **roll is the ONE thing measured in
    SCREEN px, not yards** (`dθ = ds/r` with BOTH taken as drawn — real yards and a real radius give 68
    turns per 10 yards, a grey strobe — so the ball turns as fast as it LOOKS like it should at every
    zoom, capped per frame against aliasing); and the phase rides the ball's OWN screen displacement,
    which buys the two properties that sell it for free — it stops turning exactly when the ball stops,
    and a backspin check turns it backwards with no special case. In the AIR on its flight it carries
    steady BACKspin off the clock instead. Ball skins are a ROW (`BALL_SKINS`); an equipped Story BALL
    dresses the cover from the SAME `ballTracer` row that colours its trail, so one cosmetic is one
    item. **The RESTING ball wears it too** — the aim/putt SVG map (`holeView.ts`) had kept a bare white
    `<circle>`, so the player lined up with a dot, watched a dimpled ball fly and got the dot back; both
    emitters share ONE `surfaceProjector`/`DIMPLES`/`bandPoint`, so the pattern can't change at the
    moment the swing starts, and `ballSVG` emits **no ids** (they are document-global — see
    `holeIdPrefix`). Guarded by `tests/ball.test.ts`; eyes-on `scripts/ball-preview.mjs`.
  - **THE FAIRWAY SYSTEM HAS ONE SILHOUETTE, AND EVERY PIECE OF IT IS OUTLINED** (GS-fairway-silhouette,
    `fairwayEdgeRuns`). A hole's fairway is nearly always SEVERAL polygons — corridor + green flare +
    a split lane / broken-island segments (**94%** of holes; **25%** carry a piece touching nothing else) —
    and the ink edge was stamped on `sps[0]` alone, because a per-poly outline slashed the apron's ring
    back across the corridor (GS-blend). So every other piece of cut grass shipped with NO outline: a
    split fairway drawn as a bare green smear beside an inked corridor. Both wants are one rule — walk
    each poly's own edge, keep the runs no OTHER fairway poly buries. A lone piece returns its whole ring
    (void islands byte-for-byte); an open run is a `path`, never a `poly` (which chords across the turf).
    ONE walk feeds the ink, the first-cut EDGE EASE (same fault in reverse — the flush join ramped a dark
    band across mid-fairway) and the void/cetus RIMS, so they cannot disagree. Runs lie exactly on the
    DRAWN polys — never a re-derived `unionPolys` outline (a second description of a committed edge).
    **Every tolerance is a width of GROUND, deliberately UNCLAMPED** (unlike `turfPx`): burial is a fact
    about the COURSE, and a px decision pops a run in/out on a follow-cam zoom (`tests/camera-stability`
    pins the scene's prim count across a pan). Close-then-OPEN, in that order — a flush join weaves for a
    few yards and drawn literally that is a row of dashes. Guarded by `tests/fairway-silhouette.test.ts`;
    eyes-on `scripts/fairway-outline-preview.mjs` (the gallery BURIES loose lanes — that is how it shipped).
  - **A WORLD WITH NO GROUND LIGHTS ITS OWN PLAY SURFACES, AND THE GLOW IS A ROW** (GS-cetus-void-glow,
    `style/glow.ts`). Void and Cetus are one design idea — off the cut turf is the open deep, so what the
    player looks at is a lit shape floating in it. That is a LIGHTING problem, and it was being solved by
    tinting a slab and drawing a line round it: measured on the drawn map they were the game's LEAST
    vibrant worlds (Hasler–Süsstrunk colourfulness, centre crop of a calm stop: void **31.7** vs verdant
    52.4; OKLab turf chroma: cetus fairway **0.083**, the lowest of any non-grey world, vs verdant 0.136),
    and the whole emissive kit was two flat rgba rings at α 0.10/0.14 in a greyish periwinkle, void-only.
    `WORLD_GLOW` now carries the two luminous worlds — **no row ⇒ no prims ⇒ byte-for-byte**, a third
    luminous world is a row and never a `buildScene` edit — with a graded outward BLOOM (`turfApron`, so it
    fades to nothing and has no outer edge to find), a neon RIM of three stacked strokes along the SAME
    `fairwayEdgeRuns` the ink uses (so a split lane glows on every piece), and on the GREEN — which burns
    brightest, because on a landmark-less world it is the shape the eye must find first — a rim plus an
    inner glow. Two traps: the inner glow is concentric **STROKES, never nested fills** (a stack of fills
    composites darkest in the INTERIOR, backwards, and it wipes the green's own mow/relief art), and it is
    only ever applied to a surface that STANDS ALONE (on one piece of a multi-part fairway it seams the
    flush join — GS-blend in reverse). **Reach is measured in YARDS** (the old fixed −13/−6 px rings broke
    GS-green-complex's rule: a plausible bloom on the map, a hairline at the putt camera). Chroma was
    bought at UNCHANGED lightness — a vibrant DARK world, not a brighter one; a glow reads by contrast, so
    lifting the ambient fights it — and the same hue rotation went to everything covering the ground that
    had drifted off it (`BIOME_RELIEF` hi, the cliff strata, the space nebula/rim, the star-map accent and
    the arrival hero: the splash and the course you land on are one place). Cetus 48.6 → **60.7**
    colourfulness, void chroma 0.199 → **0.238** (now above verdant's). Guarded by `tests/biome-glow.test.ts`;
    measured by `scripts/biome-vibrance.mjs`.
  - **ON A LUMINOUS WORLD THE ONLY BRIGHT THING IN THE FRAME IS THE GOLF** (GS-cetus-void-deep — the
    play-test follow-up; raising the hole is half the job, the other half is not raising the room with
    it). Three surfaces had to come DOWN. **The sky**: `nebula` is three glows sized off the SCREEN at
    1.9× the row alpha, so at the PLAY camera — where the sky is a thin margin round the hole — the
    player sees only their bright cores and the deep reads as a flat mid wash at the platform's own
    value. Void/cetus now carry the dimmest nebula in the game (0.07) and a soft rim (0.15): on the two
    worlds that ARE the dark, the sky is COLOUR AT NEAR-ZERO STRENGTH. **The pillars**: the cliff's top
    stratum was LIGHTER than the fairway standing on it (cetus L 0.703 vs 0.556, void 0.546 vs 0.400)
    and ran 0.6 of the platform's short span ≈ two-fifths of the drawn island. Strata now start a step
    UNDER the fairway (pinned to the fairway, NOT the rough — cetus is a sea cliff whose upper face
    legitimately catches light), and depth is a `CliffLook.skirt` ROW at 0.32 — a row because
    `platformCliffs` carries four materials with four jobs, and omitting it keeps the classic 0.6 so the
    derelict hull sections + Rainbow buttress are byte-for-byte. **The greens**: half render bug — the
    glow pass moved every BAND to yards and left the rim STROKES at a fixed 1.6px, and the widest pass
    is 4× the core, so a 6.4px halo covered a fifth of a 30px green (`rimYd` finishes the rule); half
    data — void 1.05 / cetus 1.10 `greenSize` were the smallest in the game outside the derelict against
    a 1.15–1.5 field, both → **1.2** (pack median; a pure multiplier AFTER the radius draw ⇒ zero rng
    moved). They are BALANCE_EXEMPT so the harness skips them — measured separately over 240 holes,
    void toPar/hole 1.0125 → 1.0333, cetus 0.8583 → 0.8500; 1.25 cost void 1.0708 and wasn't worth it.
    Vibrance HELD while the sky went dark (cetus 60.9, void 34.8) — vibrant AND dark, never vibrant
    because bright.
  - Merges: platforms + hazard families through `render/merge.ts` — platforms `dilateUnion(…,14)` (never a
    mitred outset), sand/liquid families `unionClose` bridging near pairs with a slim neck (GS-hazard-merge,
    render-only, sim penalty polys unchanged). Lost-rough cliffs extrude from the REAL lower silhouette
    (`frontEdge`, not the convex hull; GS-void-cetus-cliffs). Crossing banks are roughened mean-zero about
    the true edge (GS-hazard-edges, render-only). Luminous liquid + rusted bunkers are per-world palettes
    (`waterLiqFor`/`sandLookFor`).
  - Carved features share ONE light (`LIGHT_UL`), no drop shadow onto turf; the green is FLUSH with the
    fairway and blended into its surround via UNDER-fairway surround rings + an ON-TOP mown collar
    (GS-green-blend; void/cetus/rainbow/derelict keep their own edge). The derelict's grass-less green is
    seated into a recessed deck bay (GS-ship-deck-blend). Turf bases still emit `#3f8c3f`/`#5fd45a`.
  - **TURF BLENDS ARE MEASURED IN YARDS, NEVER PIXELS** (GS-green-complex, `shared.ts turfPx`). Every mown
    transition — the fairway first cut, the green's apron/collar, the tee fringe, the edge ease + crown
    sheen — is a width of GROUND scaled by `proj.scale` (floored/capped in px). The old fixed-px rings read
    as a plausible apron on the whole-hole map and collapsed to a hairline at the chip/putt camera, which is
    exactly where the player studies the turf: the surfaces read as stacked art assets. Ramps grade in ~6
    even steps (`turfRamp`), and a collar that sits ON an already-dressed surface TINTS it (`turfRampTint`,
    peak α ≤0.24) — an opaque ring wipes the fairway's mow/sheen and re-reads as paint. **Blending must
    never cost the green its READABILITY** (the first pass dissolved every putting surface into its
    corridor — a fairness bug): the apron is wide, the collar is deliberately narrow, and the surface keeps
    its own base fill + an inward edge ease. A world's green complex is a ROW (`GREEN_COMPLEX` in
    `style/green.ts`: `apronYd`/`collarYd`/`mowBands`) and the green MOWS IN ITS OWN WORLD'S GRAIN off the
    shared `mowPattern` dispatch on the corridor's band grid — greens used to stripe horizontally on every
    world ("most green areas look very similar"). Guarded by `tests/green-complex.test.ts`.
  - **THE GREEN'S SURROUND IS ONE SKIRT WITH NO SILHOUETTE OF ITS OWN** (GS-green-apron-blend,
    `styleGreenSurround`). It was TWO passes — an OPAQUE ramp drawn UNDER the fairway plus a tinted collar
    on top — and once GS-green-flare made the fairway genuinely wrap the green, "under the fairway" meant
    *hidden on every side the flare reaches*. Measured by rendering 14 worlds with it on and off: the visible
    apron is never a ring, it is a **one-sided CRESCENT** (0.54% of pixels, at up to 189/765 of contrast), a
    lump of a third colour behind the green — on desert/links/ocean/metal, a smear of somebody else's turf
    dropped on the sand. Now ONE band pair drawn **over the turf and under the surface**, so it rings the
    green whatever it meets (flare in front, rough behind, same hole): ground → apron (world COLLAR tone) →
    collar (the GREEN's turf) → green. Three rules: **every ring is a TINT, never a fill** (the ground's
    cover/relief/texture reads through — GS-green-complex's collar lesson, applied outward); **the outermost
    ring is INVISIBLE** (`turfApron` ramps alpha quadratically from ~0, so there is no outer edge to find —
    a band that meets the ground on a STEP is an object); and a **tight turf miter** (`offsetPoly`'s optional
    `miterCap`, 1.2 for turf, default 4 unchanged ⇒ every other caller byte-for-byte) so a star green's
    reflex notches can't spike the skirt. Apron widths came in ~⅓ — the broad run-off is the FLARE, a real
    playable feature, and two art passes describing the same yards of approach is what read as stacked
    stickers. The green's ink dropped 0.5 → 0.34 (the outline now only has to DEFINE), never lower: an
    unreadable green is a fairness bug. Derelict excluded (deck bay), rainbow rides its ribbon.
    Eyes-on `scripts/green-apron-preview.mjs`.
  - **The aim-cone overlay is SCALE-HONEST** — every layout reads the projector's px-per-yard and probes the
    sim's OWN flight walks (never fork them, never hard-code px into the sim). The cone's arcs are
    `shotSpread`'s un-shifted carry clamp; wind rides ONLY `expectedCarry` (the aim line), never the arcs.
    The pull-to-power gesture redraws ONLY the spray-cone group + HUD spans (`renderShotOverlaySVG`), never a
    full `render()` (which rebuilds the whole scene and lagged).
  - **Decor is view-state-invariant** (GS-decor-view-states): world decor is COURSE-anchored (projected +
    `proj.scale`-sized, never screen-fraction) and ALL ambient decor rides the SHARED WALL clock (raw rAF
    timestamp, not the slo-mo `vnow`), so it reads identically across aim/watch/chip/putt and never jumps on
    a view switch. Guarded by `tests/decor-consistency.test.ts` + a headless-Chromium decor probe. The Cetus
    star-waterfall + ship drift/junk are animated Canvas twins of the static SVG (`animateCetus`-off is
    byte-identical); aim-overlay decor draws through an `alignedProjector` in focus mode only.
  - Re-shoot the gallery (`node scripts/gallery.mjs`) after any `style.ts` / `style/*` change. Shop/reward
    CLUB cards draw a per-family head (GS-club-icons, `render/itemArt.ts`).

- **Audio** — `docs/decisions/audio.md`
  - ASSETLESS, always: every cue + note is synthesized WebAudio (no downloaded file, ever). ONE
    `AudioContext`, two buses (SFX `sound`, music `music`). Strikes voiced per club FAMILY, touchdowns per
    SURFACE, tree hits per ARCHETYPE (coverage machine-checked); a hazard with its own surface voice does not
    also play `sfx.penalty`. Music is table+dispatch per archetype (`MUSIC_TRACKS`, gain ≤0.35) on a PRIVATE
    seeded stream; the sim never calls audio, and audio modules import clean in node. Worlds are made
    AUDIBLY DISTINCT by per-row timbre levers (GS-music-distinct, all optional). Weather ambience is a subtle
    bed keyed to the route effect (GS-weather-audio, `WEATHER_AMBIENCE`, capped `WEATHER_GAIN_CAP` 0.16).

- **UI layer** — `docs/decisions/ui-intro.md`
  - The screen flow is a PURE reducer (`ui/game.ts`): `(UiState, Action) → UiState`, no DOM/time. `game.ts`
    is the re-export BARREL + the `reduce` switch (GS-refactor-split); state/action TYPES, cosmetic
    resolvers, and run-end/endless/ace/Asgard helpers live in sibling modules (`gameState.ts`/
    `gameCosmetics.ts`/`gameUpdates.ts`) that never import the barrel. The app SHELL is split (GS-app-split):
    `app.ts` keeps boot/dispatch/render + the play screen (still the hottest file, ~2,200 lines — extend a
    `src/app/*` module, don't grow it); every other screen is a `src/app/*` module reading `state` from
    `ctx.ts`, never dispatching or importing app.ts. **A new screen = a new module.**
  - **ONE play HUD frame** (GS-hud-frame, `app/playFrame.ts`) — the play screen's six view states (aim/chip/
    putt × decide/watch) mount the SAME five regions in the SAME places: info bar · nav column · caddy slot ·
    controls panel · action column. Only the CONTENTS change. Two rules: **nothing is removed, only
    `disabled`** (a dead control greys in place — the nav column always ships its five buttons), and the panel
    is **bottom-anchored with the COMMIT row last**, so commit · caddy · bag land at the same y in every state
    while the rows above differ in height. A new play state = new row contents, never a new skeleton
    (`tests/play-hud-frame.test.ts` forbids a second `class="gs-shot gs-shot--full"`). The caddy's slot is
    PERMANENT (hired ⇒ badge · no read here ⇒ dimmed · none ⇒ reserved placeholder), so the badge — not a
    canvas corner figure — is the caddy everywhere; `playView` takes a measured `caddyAnchor` (`{muzzle,head}`)
    and skips its own figure, absent ⇒ the classic corner figure (replay screen, unchanged).
  - **THE PAGE IS FULL-BLEED FOR EXACTLY AS LONG AS THE PLAY FRAME IS MOUNTED** (GS-play-bleed-holeout).
    `.gs-shot--full` is a whole `dvh` tall and `.gs-main--bleed` is what strips the page frame's 16/18px
    padding + `max-width`, so the two are ONE decision asked twice — disagree and the play screen is inset
    16px a side, pushed 46px off the bottom, and wearing TWO settings cogs (the global cog returns off
    full-bleed beside the nav column's own). They disagreed for one beat: `fullBleed` keyed on
    `!play.done` while `playingBody` mounts the frame on **`anim` FIRST**, and a holed putt sets `done`
    the instant it is struck — with the ball still rolling on that very map. So the predicate MIRRORS
    `playingBody`'s order (`!!animatingPlay || !state.play.done`). ⚠️ Any new "is the play screen up?"
    test must ask the same question in the same order; `done` alone is never it. Guarded by
    `tests/play-hud-frame.test.ts` (auto-finish holes out in one action, so the whole animation runs with
    `done` already true).
  - **A READOUT THE MAP ALREADY DRAWS IS NOT A HUD ROW** (GS-hud-bag, `app/clubPicker.ts` + `render/bagArt.ts`).
    The aim panel's power label, spray-odds legend and carry range restated the aim cone — drawn to scale, on
    the map, where the decision is made — for ~140px of an 844px phone, and its club CYCLER was a dozen taps
    to reach a wedge in a full bag. So the club is a BAG button bottom-right opening a picker sheet (glyph ·
    name · carry, one tap to any club), the power rides the commit button as a fill behind
    `🏌 Swing · Power 78%`, the aim mode is a round button, and the aim/watch panel dissolves to that one pill
    (`--slim`). **The PUTT panel is untouched** — its pace meter and break read are the only play-screen
    readouts the map does not draw. Sam's green-depth/forced-carry read moves to the picker HEADER (it is
    advice about which club) and stays gated on `clubSuggest`, with the ★ marking their pick; every row's
    carry is the club's own bag stat, so the sheet is a bag, not an adviser. **Only the BAG is in flow** —
    `.gs-hud-bottom`'s height IS the camera's clear band, so the aim/`»`/🎯 stack floats above it over the map
    or the bar would be as deep as the panel it replaced (bar 148→66px, band 50%→77%, and the ball drops to
    just above the pill for free through `playFocusBias`). The sheet is a `.gs-sheet` DIRECT child of `#app`,
    so dialog/focus/`inert`/Escape all come from GS-a11y-focus + `backIntent`, never hand-rolled. Guarded by
    `tests/club-picker.test.ts`; the bag art is a leaf module (pure SVG, NO ids — they are document-global and
    the glyphs ship a dozen per sheet).
  - **THE TOP BAR IS AN INSTRUMENT CLUSTER, NOT A LIST OF CHIPS** (GS-hud-compass, `render/windCompass.ts`).
    It was up to six independently-wrapping rows saying overlapping things (hole/total · par+length · live
    yardage · points · placing · lie · a wind SENTENCE · two hole descriptors). Now: a wind COMPASS anchored
    left + centred PODS — one shape for every number, `big value / small ALL-CAPS caption` — with lie + placing
    on the line under, then the pips. **A pod's width is FIXED, not a floor** (the hero yardage pod's caption
    changes per state — "y to pin" → "in air" — and a growable pod pushed the score onto a second row the
    instant a shot was struck, the exact reflow GS-hud-frame forbids). **The needle reads against the SHOT
    bearing** (`windRead(hole, upBearing)`), because that is BOTH what the map is oriented down (GS-default-aim)
    AND what the sim resolves wind against (`playWind`) — so needle, picture and physics agree; the argument is
    OPTIONAL and defaults to the hole line, so the once-per-hole a11y narration is byte-for-byte. Weather rides
    the dial as the effect's own badge. Hole SHAPE/WIDTH descriptors moved to the TEE CARD (briefing, fixed for
    the hole) — the play-bar copy is deleted, not hidden. The nav column is **TWO buttons**: the whole-hole view
    is a latching toggle like the aim mode and leaving it RESETS zoom+pan (the old ⌖ recenter folded in);
    ＋/－ are retired in favour of pinch. The Stableford pod colours by PACE (`cut × holesPlayed / holes`), never
    the raw gap — the old test opened every stop on a red zero. Guarded by `tests/hud-topbar.test.ts`
    (bar 112→88px, band 50%→80%).
  - **A READOUT ANSWERS FOR THE PLAYER'S BAG, NOT A BARE ONE** (GS-hud-gear-reads). The lie chip printed
    `lieInfo(lie)` and the wind read printed `hole.wind.spd` — the raw TABLE and the raw SKY — so a bunker
    said "−50% carry · wild" to a player whose escape caddy/story gear had already halved it, and a
    45%-resist ball was shown the 20mph gale it flies through at 11. The aim cone beside them was already
    honest (`previewShot` gets the whole loadout), so the TEXT was the only liar. Both now fold the sim's
    OWN function — `reliedLie` for the lie, `windResistFactor` for the wind (ONE clamp, used by
    `resolveShot`/`shotSpread`/`aimWithWind` and the dial; story clubs add `windResist` uncapped, so a
    display that clamped differently would print a negative wind). **A perk needs a TELL**: the eased lie
    wears a 🛡 and the cut dial rings itself cyan, or good gear just makes the world look easy. The
    once-per-hole a11y narration passes the same `windResist` — spoken and drawn are one read. Guarded by
    `tests/hud-gear-reads.test.ts` (expectations derived from the sim's functions, never hard-coded).
    ⚠️ When adding a HUD number, ask which loadout field the sim applies to it — `lieChip` is pure
    (`lie`, `relief`) precisely so the answer is visible in its signature.
  - **THE PUTT IS THE ONE STATE WITH ROWS, AND IT MUST LOOK LIKE THE SCREEN IT SITS ON**
    (GS-putt-panel). GS-hud-bag deleted the aim panel's rows, which left the putt panel wearing the
    club cycler's chrome (`.gs-clubrow`'s heavy slabs — by then a putt-only class), a flat private-palette
    canvas, and THREE LINES OF PROSE re-teaching the controls every putt, beside a top bar that had just
    compressed sentences into pods. It now speaks the frame's language: the aim is a POD
    (`.gs-hudx__pod`'s proportions; the caddy credit rides its caption), the ◄/► are round-button-weight
    nudges (never commit weight — a nudge must not out-shout ⛳ Putt), the meter is a lit instrument, and
    the note is a caption. **An instruction printed ON the control it instructs costs no row** — the
    meter says `TAP TO STOP`, which is what let the prose go. Panel ~225 → ~185px. Three rules: a
    styling pass may NOT touch the sweep period / pace mapping / make band (contract-4 balance, the
    harness's, not a repaint's); **a canvas must fetch the tokens itself** (`--gs-font` +
    `--gs-accent`/`--gs-ink`/`--gs-dim` off its mounted element — a hard-coded family in a canvas is a
    label Readable-text can never reach, and it carries `role="button"` + a name because it IS a
    control); and the meter's width floor sits UNDER the panel's real inner width (240 → 200, it was
    overhanging the glass on every phone). Guarded by `tests/putt-panel.test.ts`; eyes-on
    `scripts/putt-panel-preview.mjs`.
  - **THE HUD FLOATS OVER THE GOLF, SO THE CAMERA MUST FRAME AROUND IT** (GS-play-hud-space). The camera
    biases the ball as LOW as the control panel allows and no lower (`project.ts clearOfPanelBias`; a low
    ball is what fills the frame with the shot AHEAD, so "just centre it" is the wrong fix), and the putt
    centres its ball↔cup span in the CLEAR BAND, not the frame (`bandCentreBias`). A flat constant put the
    ball ~60px INSIDE the panel for the whole flight. Two rules: the band is measured **per play mode**
    (`playBandByMode`) — a body is built while the PREVIOUS state's HUD is mounted and panel heights differ
    per state — and the resolved bias is **STORED** (`decisionBias`/`puttViewBias`, the twins of
    `decisionRadius`/`puttViewRadius`) for the watch camera to REUSE, since re-deriving it at release reads
    the watch panel and pops the camera on every swing. Guarded by `tests/map-frame.test.ts`.
  - **HUD height is bought back from WRAPPING, never from type size** (GS-play-hud-space). The readouts were
    sized on a play-test verdict that they were too small; the space was going to wrapped rows instead — a
    one-line stats row measuring 49px, and a controls column squeezed into 240 of 390px by its flanking
    caddy/action columns, which wrapped every text row. Shorten the LINE (labels moved to the conditions
    sub-line, narrower flanks) before touching a font size. 41%/46% of the screen → 34%/39%.
  - **THE PLAYER OWNS THEIR OWN TYPE** (`docs/decisions/accessibility.md`; GS-a11y-readable-text). Four
    `:root` tokens are the ONLY way the app expresses a typeface or a UI size — `--gs-font` (family),
    `--gs-uiscale` (whole-UI `zoom` on `<html>`), `--gs-track`/`--gs-wordspace`. **Nothing else may name a
    font family**: every `font-family` AND every `font:` shorthand resolves the token, or the Readable-text
    toggle can't reach it — which is exactly how the settings sheet shipped in **Times New Roman** (the
    stack sat on `.gs-main`; overlays are SIBLINGS of `<main>`, so the family lives on `body`). Defaults are
    inert (`0em`/`1`) ⇒ the untoggled game is byte-for-byte, and `fc_settings` merges over defaults ⇒ no save
    bump. Two rules make the zoom safe, both machine-checked: **no raw `100vh`/`100dvh`** (use `--gs-vh`/
    `--gs-dvh`, which divide by the scale — a viewport-locked box inside a zoomed root measures one screen of
    ZOOMED units and put the Swing button 185px below the fold), and **no canvas computes its own
    `devicePixelRatio`** (use `render/pixelRatio.ts canvasRatio()`, which folds the zoom in — sized off
    layout px the play view rendered at 0.69× its display resolution, i.e. blurry, on the very setting meant
    to make it legible). ONE scale lever fixes small text AND sub-44px targets together: at the top rung
    every play control clears 44px with nothing off-screen. **MEDIA QUERIES ARE BLIND TO THE SCALE** —
    `zoom` shrinks the layout BOX but NOT the media-query viewport (`max-width:320px` is still false on a
    375px phone at 1.45×), so a breakpoint can never answer "too cramped at large text"; make the content
    cope intrinsically (`overflow-wrap:anywhere` / `min-width:0` / `flex-wrap` / `auto-fit`) — "Unending
    Universe" clipped out of its `overflow:hidden` tile until it could break (GS-a11y-scale-wrap).
    **We ship NO dyslexia font and that is
    deliberate** — the letterform faces (OpenDyslexic/Dyslexie) repeatedly fail to beat plain Arial, and the
    one positive result resolved to SPACING, not shapes; so the toggle buys tracking/word-spacing/leading,
    kills italics and justification, and asks for legible faces already on the device. Guarded by
    `tests/accessibility.test.ts`.
  - **A `position:fixed` BOX BIGGER THAN THE VIEWPORT IS UNREACHABLE CONTENT** (GS-a11y-sheet-scroll) —
    the page cannot scroll it, that is what fixed MEANS. Every overlay caps itself to `var(--gs-dvh)` and
    scrolls INSIDE (`overscroll-behavior:contain`), and centres with **`align-items:safe center`**, never
    `center` — a centred item taller than its scroller overflows BOTH ways and its top can't be reached.
    The settings sheet measured **1515px on an 844px phone** at the top rung with everything above "Save
    data" gone for good (and was already −326px at the SHIP scale, default text); the sheet head is
    `sticky` so the ✕ survives the scroll. **NO RAW VIEWPORT UNIT ANYWHERE** — any multiple, not just
    `100vh`: the old guard matched the literal `100vh`/`100dvh` in `index.html` and ten rules walked past
    it (`92vh` on the golfer dossier, three `60vh`s in TS style strings). The guard now bans
    `\d+(vh|dvh|svh|lvh)` in the stylesheet AND in `src/**/*.ts` (`src/test/**` exempt — separate page,
    no `--gs-uiscale`).
  - **`1fr` IS `minmax(auto, 1fr)` AND `auto` IS A MIN-CONTENT FLOOR** — a track whose item can't shrink
    further pushes the whole grid past its container. That one default is why the settings chips hung off
    the sheet, the travel console's fuel gauge slid under the command dial, and the shop's hero CTA
    clipped to "Trave/onwa". Use `repeat(auto-fit, minmax(min(Npx, 100%), 1fr))`: it can't blow out AND it
    drops a column on its own, which no breakpoint could decide.
  - **WHEN WRAPPING CAN'T RESOLVE IT, BRANCH ON `data-gs-fit`, NEVER A BREAKPOINT** (GS-a11y-tight-fit,
    `app/viewportFit.ts` — the ONLY module that may compute a scaled viewport, like `pixelRatio.ts` for
    DPR). Intrinsic sizing is still the first answer; `data-gs-fit="tight"` (`innerHeight/uiScale < 660`
    or width `< 330`) is for the genuine either/ors. Today that is the play HUD: the caddy badge + `»`
    stop FLANKING the controls panel (66+40+gaps of 269 units left it **135** to lay out in, so the stack
    grew 265→380) and float over the map just above it — nothing removed, nothing moved between states —
    and the hole's shape/width descriptors leave the conditions line, because they are BRIEFING (constant
    for the hole, already on the tee card) not live state. **83% chrome → 61%, clear band 17%→39%.**
    Never buy HUD room back by shrinking type on the very setting that asked for bigger type: at a tight
    fit show FEWER things at the SAME size.
  - **TRACKING IS HELD OUT OF SVG `<text>`** — `letter-spacing`/`word-spacing` inherit, and an SVG label
    is GEOMETRY placed at coordinates: it can't wrap, so widening it ran the travel map's lane captions
    off the chart. The legible FAMILY still applies.
  - **ONE SCREEN IS A GOAL, NOT A CAGE** — a viewport-locked screen that `overflow:hidden`s content it
    genuinely can't fit has hidden it for good. `.gs-charwrap` squeezed `grid-auto-rows:1fr` until the
    cards clipped mid-word; rows now keep a `min-content` floor and the roster SCROLLS.
    GS-select-onescreen's fit still wins wherever it can be had (every phone at the ship scale). Guarded
    by `tests/a11y-mobile-layout.test.ts`; eyes-on rig `scripts/a11y-scale-preview.mjs` (read its
    `scrollAnc` column — off-screen is only a BUG when it says `none`).
  - **AN OVERLAY IS A DIALOG, AND EVERY CONTROL IS OPERABLE BY KEYBOARD** (GS-a11y-focus,
    `app/focus.ts`). ONE pass at the END of `render()` — never a patched overlay builder — so a NEW
    overlay gets the behaviour by existing: `role="dialog"`/`aria-modal`/a name off its own heading,
    focus moved IN on open and handed back to the opener on close, and the rest of the app sealed with
    **`inert`** (not a hand-rolled Tab trap: one attribute covers tab order + a11y tree + hit-testing, and
    6 buttons behind the settings backdrop used to stay tab-reachable). Three rules: focus is restored by
    **SELECTOR, not element reference** (`captureFocusOrigin()` runs immediately BEFORE the innerHTML
    assignment — after it the node is detached and `activeElement` is already `<body>`); focus moves in only
    on the OPEN transition, and a surgical re-render wraps in `preservingFocus()` (else flipping a switch
    throws the player to the top of the sheet); and only a DIRECT child of the app root is treated as an
    overlay (inerting `<main>` around a nested one would inert the overlay itself and freeze the app). Every
    non-native `role="button"` gets a tab stop + Enter/Space via `wireRoleButtonKeys`, which synthesises a
    **click** so there is no second activation path to keep in step. A `<body>`-LEVEL takeover is NOT
    covered by this pass (it only walks `#app`'s children) and must seal the app itself — the boot
    cinematic sets `#app.inert` while it plays and releases it in its single `finish()`; before that, Tab
    walked into a title screen the player couldn't see. A bare `:focus-visible` ring is a
    specificity FLOOR (0,1,0), so bespoke rings still win — but a rule that sets `outline:none` must restore
    one. Guarded by `tests/a11y-focus.test.ts`.
  - **THE GAME SAYS WHAT IT IS DOING** (GS-a11y-announce, `app/announce.ts`). Everything that happens
    happens on a CANVAS, so without narration a screen-reader player got silence for a whole round. PURE
    sentence builders (node-testable) read the SAME `ShotLog` fields the shot card draws ⇒ spoken and drawn
    can't drift; a guarded writer puts them in `#gs-live`. Three rules: the region lives **OUTSIDE `#app`**
    (`render()` replaces `app.innerHTML`, and a live region rebuilt every render is never reliably
    announced — it must PERSIST for a content change to register); it is **`polite`, never `assertive`** (a
    shot resolving is news, not an alert); and it is hidden by CLIPPING (`.gs-sr-only`), never
    `display:none`/`visibility:hidden`, which would drop it from the a11y tree. The situation preamble fires
    once per HOLE keyed on the COURSE SEED (per-shot would be noise — each shot's report already ends with
    the distance left); the shot report fires beside the sfx on settle, NOT with the visible card (which may
    be 300ms away or skipped under Fast Shots), and its lateral miss is measured off the AIM RAY like the
    card's. A repeat message blanks-then-re-sets so two pars in a row both speak. Decorative canvases/SVGs
    are `aria-hidden`; the hole map is `role="img"` + a name (it was leaking loose `<text>` yardages); and
    anything encoded in COLOUR ALONE needs a `.gs-sr-only` twin (the momentum pips had none). Guarded by
    `tests/a11y-announce.test.ts`.
  - **THERE IS ONE REDUCED-MOTION ANSWER AND IT IS `settings.reducedMotion()`** (GS-a11y-motion). The
    setting is SEEDED from `prefers-reduced-motion` and is the player's own after that, so it is strictly
    more informed than the query — a gate that re-asks the OS ignores a player who turned the toggle ON
    (four cinematic gates did exactly that), and one that only asks the OS ignores a player who turned it
    OFF. **No module outside `settings.ts` may read `matchMedia` for reduced motion** (machine-checked). The
    setting reaches CSS through a `.gs-reduced` class on `<html>` + ONE blunt rule collapsing every
    animation/transition DURATION (not `animation:none` — several entrances start at `opacity:0` and would
    never arrive); the ~19 bespoke `@media` blocks still serve the OS preference. Camera shake is
    AMPLITUDE-gated, never branched around, so all 12 `shake = Math.max(…)` sites keep one code path.
    **The putt meter is deliberately untouched**: slowing the sweep / widening the band / defaulting to
    auto-putt are all BALANCE changes and must go through the death-spiral harness (contract 4), not ship
    under an accessibility banner. Guarded by `tests/a11y-motion.test.ts`.
  - **THE SHOT HAS ONE MECHANIC AND TWO DEVICES** (GS-a11y-keyboard). The pull gesture was the ONLY way
    to aim or modulate power and it is pointer-only, so a keyboard/switch player could reach Swing but was
    locked to the seeded aim at the seeded power. Arrows now mirror the drag axes (L/R aim · U/D power ·
    Shift = quarter-step) through the SAME `setAimPower` the drag calls — `applyDrag` no longer derives its
    own free target, so the two inputs cannot drift (machine-checked). NO Enter/Space handler: the Swing
    button already commits, and a global commit key would double-fire with the focused control. **The
    listener is bound per render, so its cleanup runs at the TOP of `wireShotGesture`, BEFORE every early
    return** — bound naively each render stacks another `window` listener and one press steps the aim N
    times; and the early returns are exactly the cases where the decision screen went away (putt, popup,
    another screen). Guarded by `tests/a11y-keyboard.test.ts`.
  - **CSS classes / DOM ids are GLOBAL and screens can't see each other's names** — new screen chrome gets
    its OWN prefix (bridge HUD `.gs-bhud`, resume `.gs-resume`, lore `.gs-lore`, star-tour content
    `.gs-sthud` — NEVER the play screen's `.gs-hud`, which the #353 map-blur regression proved). Grep the
    class before adding a rule; add a browser layout smoke test for new screen chrome. Between-screen views
    are reachable headless via `?screen=…` deep-links (GS-screen-deeplink, real reducer transitions).
  - **Default aim** is a smart assist (GS-default-aim, `Settings.aimMode` default `'auto'`) resolved by the
    shared `aimTargetOf`/`autoAimTarget` so `previewShot`/`takeShot`/auto-finish stay byte-identical
    (contract 2); the default CLUB is `autoAimClub` in lockstep (a forced-carry drive picks
    `longestCarryClub`, not a clubbed-down wood). Interactive-only — the headless `playHole` keeps its own
    line, so determinism is untouched. The shot map ORIENTS down the resolved aim line.
  - **Surgical refreshes, not full renders** — an in-sheet toggle/aim tap swaps `.gs-settings` innerHTML +
    re-wires (`refreshSettings`, GS-settings-flicker); the settings sheet inner is split from its backdrop;
    the pull-to-power drag redraws only the overlay. A full `render()` re-mounts frames and replays slide-up
    animations as a flicker.
  - Screen specifics: the settings cog rides EVERY screen (return-to-title parks the run as `resumable`,
    never snapshots the title's placeholder run). Character select fits ONE mobile screen with no scroll
    (GS-select-onescreen, viewport-locked flex column, the card IS the button on phones); Ascension + club
    set are picked WITH the golfer via dropdown pills (GS-diffpills). **Tapping a golfer's PORTRAIT (not the
    card) opens a lore popup** (GS-char-lore, `characterLoreId` + `show/closeCharacterLore`, `render/
    characterLore.ts`, own `.gs-charlore*` prefix) — name/age/blood/gender+pronouns/relationship/best wins/
    lowest moment/fun fact over a procedural HOMETOWN backdrop keyed by `Character.origin`; the portrait
    `stopPropagation`s so the surrounding card still SELECTS. Mode-agnostic: the card grid (Voyage/Unending/
    Star Tour) and the Story clubhouse inspect both raise it; `Character.lore` is pure content-as-data (a new
    golfer adds the block, zero save bump). The stop intro is two reducer sub-steps
    (`introStage`); past stop 0 every mode opens on the `'hole'` step (strokeplay skips the arc lobby
    entirely, GS-story-tour). The title is a hero wordmark + three GAME tiles over two doorways; CONTINUE RUN
    is thematic + mode-aware (GS-continue-button, own `.gs-resume*`). Star Tour mid-round resume carries live
    round progress (save v29, strokeplay-only ⇒ else byte-for-byte).
  - **Star Tour star map** (GS-star-tour / GS-star-tour-2, `app/starTourScreens.ts` + `render/starTourMap.ts`)
    — a full-bleed free-roam celestial chart; every course plotted at its constellation's real J2000 position
    over a mulberry32-seeded backdrop (never `Math.random`). Character select comes FIRST; you FLY the
    golfer's cosmetic ship (an app-layer rAF `stepStarTour` loop) at a near-constant rarity-scaled cruise
    (GS-star-tour-map-improvements). Flight orientation is per-ship (`ShipLook.fly`: `'nose'` rotates to
    heading, `'hover'` stays upright with a bank + a downward repulsor, GS-ship-fly-orient/GS-ship-hover-prop).
    Gestures are hand-driven (pan / pinch-zoom, `wireStarTourGestures`; a moved drag suppresses the trailing
    click; never `setPointerCapture` on the tap). The chase-cam follows via `starTourView.following`, cleared
    the instant the player takes manual control (not the per-frame `cruising` flag, GS-star-map-jerky-
    movement). The cockpit HUD REUSES the bridge HUD (`.gs-bhud--st`, themed by ship); the console carries
    pilot-swap · deck · speed · FIRE · fuel IN-FLOW. Destinations are bespoke luminous celestial objects
    (`SIGNATURE[themeId]` + `TINT_OVERRIDE`, GS-star-map-icon-consistency) on a bigger padded canvas
    (GS-star-map-bigger-canvas, positions just translate by the pad). Map-only FEEL mechanics live ONLY in
    `starTourView` (never the sim/save/round, so records stay comparable): FUEL by distance (GS-star-tour-fuel,
    a space tanker refuels on empty), ship WEAPONS (GS-star-tour-weapons, `WEAPON_BY_KIND` row per `look.kind`,
    firing appends shots without a `render()`), and the hidden **Yggdrasil** World Tree (GS-star-tour-
    yggdrasil, shown only once Thor's Hammer is owned; Asgard is the only playable realm, others are
    data-flip placeholders). `intro`/`strokeResult` are strokeplay-branched; deep-linkable + guarded by
    `tests/startour-flow.test.ts`. Re-shoot `scripts/startour-preview.mjs`.
  - **The finale battle has TWO bosses, one engine** (GS-story-battle-3 / GS-story-warden-ark,
    `render/storyBattle.ts`): the Warden fights **Jörmungandr**; the Herald fights the **Warden Ark**, the
    Order's capital ship holding the root (`render/wardenArk.ts`) — you cannot make the player shoot the
    serpent they came to free. Both painters return the same `BossAnchors`, so targeting, `muzzlePos()` and
    the golf finisher (bared eye / exposed reactor core) are ONE code path, and the three attack shapes keep
    identical timings/speeds/counts — only the WEAPON art changes (venom→flak, called lightning→lance
    lock-ons fired FROM the ship, void orbs→torpedoes). A new boss = a new painter + a `herald`-style branch,
    never a forked fight loop. Re-shoot `scripts/battle-preview.mjs`.
    **AND IT IS DRAWN AT THE ORIENTATION THE SCREEN HAS ROOM FOR** (GS-story-battle-portrait,
    `render/battleFrame.ts` — the fight's `fitFrame`). The arena is composed in a 1000×600 LANDSCAPE frame
    and the game is portrait, so on a 390×844 phone it meet-fitted to a **390×234 strip between two slabs of
    black**. There is no orientation lock worth having (absent on iOS Safari, fullscreen-only on Android, a
    native plugin in the shell), so on a taller-than-wide container the whole arena TURNS 90° CCW instead:
    design +x (toward the boss) becomes screen UP, the boss looms at the top, your ship flies at the bottom,
    its fire rains down — 2.8× the drawn area, and every piece of art comes along for free because it was
    all drawn facing along +x. **The camera turns; the FIGHT NEVER LEAVES DESIGN SPACE** — positions,
    hitboxes, bounds, speeds, spawns and phase timings are untouched, so the balance and the
    fairness-by-construction hold without re-measuring. It turns only when turning buys scale ⇒ landscape /
    desktop / the 5:3 preview rig are byte-for-byte. **The HUD is ALWAYS UPRIGHT, so it has its own frame**
    (the arena box in landscape — same numbers; the whole safe screen when turned, which hands it the
    letterbox BANDS so the bars stop covering the playfield); every bottom caption hangs off one `barTop()`.
    Two traps a turn exposes: a full-frame wash must cover the VIEW RECT, not the arena box, and a painter
    that hard-clips its own wash to the design box draws a step across the sky (`paintSerpent` takes an
    optional `frame`; both default to the shipped behaviour). The aim sweep is ONE offset (`reticleOffset`)
    that the strike test reads and the reticle is merely DRAWN on whichever axis crosses the boss on screen,
    so the finisher's timing window is provably orientation-independent. Guarded by `tests/battle-frame.test.ts`.
    **AND IT IS A SET-PIECE, NOT A SKIRMISH** (GS-story-battle-epic — *"it should be pretty flashy and epic
    and at the moment it is just fine"*). Five rules, ALL render-only (no damage, spawn, cooldown, threshold
    or hitbox moved, so the balance and fairness-by-construction are untouched): the boss **ARRIVES** — a
    2.8s entrance (`battleIntro.ts`, pure) looms it out of the dark, slams its NAME + epithet on, ROARS, and
    wipes the HUD in behind the plate (tap skips it; the assault's clocks start when it ENDS); hits **BITE**
    — hitstop with the ART CLOCK frozen too, a damped-spring flinch along the shot's axis, sparks, and an
    upright floating damage number; the phase turn is a **BEAT** — ONE `bossRoar()` seam whose shockwave
    visibly BLOWS THE FIELD CLEAR, plus a colour wash and a title that SLAMS; the arena has a **PLACE** —
    the root, parallax wreckage, a far fleet, a waking storm; and the bar is a **BOSS BAR** — name +
    epithet, a pale CHIP bar draining a beat behind, shields that shatter. In portrait the boss is drawn a
    fifth BIGGER, scaled about a fixed head/bow pivot so the muzzle barely moves — and **the returned
    anchors are mapped through the same scale**, or targeting/muzzle/finisher become a second description
    of where the boss is. It releases to 1 as the aim reveal pushes in (that framing is already composed
    round the bared eye). New decor draws from its OWN stream (`drng`), never the fight's `rng`, so scenery
    can't shift a volley. ⚠️ Re-lighting the serpent for the turned camera was BUILT AND THROWN AWAY: its
    form-shading key light runs across design +y, and screen-up is design +x — the beast's own SPINE — so
    the "fix" shades it lengthwise and drops the head into shadow. **The side-on read is a property of
    turning a side-on COMPOSITION; only a portrait-authored pose fixes it.** Guarded by
    `tests/battle-intro.test.ts`; eyes-on `scripts/battle-preview.mjs` (its assault waits carry an explicit
    `ENTRY` term — a bare number is a silent 2.8s error).
    **AND THE GUNS ARE THE SHIP'S GUNS** (GS-story-battle-arms, `render/battleArms.ts` — the battle twin of
    the star map's `shipWeapons.ts`). Every hull used to fire from ONE point off the nose with no muzzle
    flash, so a mythic saucer spat buckshot exactly like the woody estate. An armament is a **ROW keyed by
    `look.kind`** (compile-forced by the `Record`, so a new kind fails to build until its guns are decided):
    MOUNTS (hull-local hardpoints) · FIRE pattern · MUZZLE FLASH shape · TRAIL motif, in the ship's OWN
    `look.flame`/`glass` so a new ship row brings its weapon livery with it. **THE SPLIT: the upgrade says
    what a shot DOES, the hull says where it comes from and how it reads** — the HUD seats one trigger per
    arsenal upgrade, so a hull that overrode the projectile SHAPE would make all five fire the same thing
    and an arsenal would stop reading as an arsenal. **ZERO BALANCE: a mount moves where a shot is BORN,
    never how many there are** (`landPlayerHit` is per projectile, so one extra is one extra hit).
    `shipBank()`/`shipBob()` are the ONE definition of where the hull is — sprite, barrels, flashes and
    shots all read them, and a flash is stored by MOUNT INDEX, never a world position, or it slides off a
    hull that is flying. Guarded by `tests/battle-arms.test.ts`; eyes-on the preview's SHIP RAIL (which
    samples each hull in a BURST — a 150ms flash against an ~800ms autopilot cadence means one wait lands
    between shots).
    **AND IN PORTRAIT THE FLEET IS DRAWN FROM ABOVE** (GS-story-battle-topdown, `render/shipTopArt.ts`).
    This is where turning the camera genuinely BREAKS, unlike the serpent: a snake striking head-first down
    the screen is a real pose; **a car seen in SIDE ELEVATION while it flies away from you is not a pose at
    all** — you are looking at the driver's door of a receding thing, and the neck tilts to fix it.
    `shipArt.ts` stays the side elevation (star map, cards, pads, and the LANDSCAPE fight, byte-for-byte);
    the plan-view twin is authored in the **IDENTICAL ±20u right-facing frame**, so it is a sprite SWAP —
    `SHIP_W`/`SHIP_H`, hit radius, shield, flame and every hardpoint are untouched. **A plan view is
    symmetric about the KEEL**, and that forces `planMounts`: a side elevation HIDES the far-side gun, so a
    one-sided mount set is MIRRORED (wagon rack → 4, UFO rim → a ring of 6) while a set that already spans
    both sides is left alone; centreline mounts never double. No SVG ids (document-global) and **no SMIL**
    — the battle rasterizes into an `<img>`, where animation never runs. Guarded by
    `tests/ship-top-art.test.ts` + the plan-mount rule in `tests/battle-arms.test.ts`.
  - **Intro cinematic** (`docs/decisions/ui-intro.md`) — cosmetic Canvas2D, not in the reducer; degrades
    safely (every frame in try/catch → `finish()`); the many-instance glow uses a cached sprite, never
    per-element `shadowBlur`. The real title boots first; the intro overlays it.

## Testing & the test/demo hub
- `tests/` (vitest) imports the pure `src/sim/` modules and asserts on seeded runs. CI
  (`.github/workflows/tests.yml`) runs the suite on every push/PR. **Keep new game logic in
  `src/sim/` (pure)** so it's reachable from tests.
- **Test & demo hub** (`test.html` / `src/test/`, full story in `docs/decisions/process-and-deploy.md`).
  Re-implements ZERO game logic — it pokes the built artifact (Demo iframe) + imports the pure sim
  (Sim Lab). **Most changes need no hub edit** — content rows + sim behaviour are absorbed
  automatically. The ONE thing that needs hand-wiring is a brand-new **hook** (a `window._gsX` flag
  or a `?param`): `tests/test-hub.test.ts` auto-discovers every hook and asserts the hub drives
  exactly that set — add a flag without a hub control and CI goes red. When you add a hook, do it in
  one atomic PR (add hook → add hub control → confirm guard green → update docs); the
  `keep-test-hub-in-sync` skill walks it.

## Change, versioning & deploy
- `main` is branch-protected. Each change: branch → edit → commit → push → PR → merge → sync.
- **`dist/` IS BUILT ONCE, BY `tests/globalSetup.ts` — no test file may build it.** Eleven test files
  drive the built artifact in a browser; the game build is `emptyOutDir:true`, so a per-file
  `vite build` in a `beforeAll` DELETES `dist/` out from under whichever parallel worker is mid-
  `page.goto`. The symptom is a bare `net::ERR_FILE_NOT_FOUND at …/dist/index.html` landing on a
  different test each run — CI built one commit twice and got a pass AND a failure. Guarded by
  `tests/build.test.ts`.
- **Run `npm run check` before every push — NOT just `npm test`.** `check` = `typecheck && test &&
  build`, the exact CI gate in order. `npm test` (vitest) transpiles with esbuild and does NOT
  type-check, so a green suite says nothing about `tsc` (missing required args, unused vars, wrong
  types) — that's exactly how #347 shipped "green" and failed CI at the typecheck step. A green
  vitest run ≠ type-clean ≠ builds.
- **READ THE SKIPPED COUNT, NOT THE PASSED COUNT — A SKIPPED TEST IS NOT A PASSING ONE**
  (GS-browser-test-gate). Nine files drive the BUILT artifact through playwright-core and are the
  ONLY guard over DOM/CSS/layout/focus/deep-links; the pure-sim suite is blind to all of it. They
  gate on `it.runIf(chromePath)`, so with no browser found they report **skipped** and vitest still
  says green. Each file used to carry its OWN copy of the lookup and the copies had DRIFTED: five
  checked `CHROME_PATH`, four searched Linux-only Playwright cache dirs. `tests/build.test.ts` was
  in the second group, so its **50 tests were skipping EVERYWHERE — CI included, for months**. The
  tell was visible all along and read past every time: local and CI both reported exactly 60
  skipped. If it had merely been a Windows gap, CI's number would have been lower.
  **There is now ONE lookup, `tests/chromium.ts`** — `CHROME_PATH` → Playwright caches → system
  Chrome/Edge/macOS — always verifying the BINARY, never a directory (a `chromium-*` dir can exist
  without one; testing the dir made `runIf` lie and hard-fail CI instead of skipping cleanly). It
  needs no env var on any normal machine: **2344 passed / 0 skipped** locally, against the 2271/72
  that used to read as green. A new browser test imports `chromePath` from there — **never
  re-derive it**, that is the second description this whole entry is about.
  ⚠️ **The 50 dead tests were hiding a stale assertion**: the finale test read
  `fc_story.completed`, but that blob is a ROSTER (`{campaigns:{id:StoryState}}`) since
  GS-story-campaign-slots, so it had been comparing `undefined` to `true`. A dead test rots without
  telling you.
  ⚠️ A browser test must not depend on the real CLIPBOARD: `grantPermissions` applies to a
  BrowserContext and `browser.newPage()` makes its OWN, so the grant lands on a context the page
  isn't in (and headless clipboard access is flaky even when granted). Stub
  `navigator.clipboard.writeText` to resolve/reject and assert each branch instead.
- **CSS classes / DOM ids are GLOBAL; the app is split across many `src/app/*` + `src/render/*`
  modules that can't see each other's names.** New screen chrome gets its OWN class prefix (the
  bridge HUD is `.gs-bhud*`, NOT the play screen's `.gs-hud`). Before adding a `.gs-foo {` rule, grep
  `gs-foo` across `src/` — reusing another screen's class silently restyles it (the #353 full-screen
  map-blur was `.gs-hud` shared between the play HUD and the journey HUD). If it renders a new screen,
  add a browser layout smoke test (`tests/build.test.ts` pattern) — the pure-sim suite is blind to
  CSS/DOM. Between-stop/run screens are reachable in a headless browser WITHOUT playing a stop via the
  `?screen=travel|shop|starmart|trademarket|clubhouse` deep-link (GS-screen-deeplink, `jumpToScreen` in
  `app.ts` — a test-only URL param like `?rainbow=`/`?asgard=`, driven from the hub's Demo rail; it
  mounts each screen off the REAL reducer transitions, so a render bug can't hide behind it). CI installs
  Chromium + runs `npm test`, so these guards run on every push/PR. See
  `reports/regression-postmortem-2026-07-11.md`.
- **Default to shipping all the way.** When a change is complete and tests are green, take it to done:
  open the PR, enable auto-merge (`enable_pr_auto_merge` — GitHub lands it when the required `test`
  check passes and deletes the branch), then sync `main`. Only stop short if the work is WIP, the
  user says not to, or CI is red/unresolved. If CI is already green with no pending required check,
  `merge_pull_request` directly.
- Repo settings auto-merge depends on are admin-UI only: *Allow auto-merge*, *Auto-delete head
  branches*, and a branch-protection rule on `main` **requiring the `test` check**. Set once by hand.
- Commit messages explain the *why*; end with the `Co-Authored-By: Claude` trailer.
- **Deploy = GitHub Pages, Source MUST be "GitHub Actions"** (not "Deploy from a branch"). `pages.yml`
  builds the Vite app and serves `dist/` (a single inlined `index.html`). If Source is a branch,
  Pages serves the RAW source whose dev entry `/src/main.ts` 404s → permanent blank page. Symptom
  signature: the boot watchdog reports `…/src/main.ts` — a string a Vite *build* can never emit, so
  seeing it = raw source is being served. Keep the `index.html` boot watchdog (`tests/build.test.ts`
  guards the inlined-single-file output + the error-capture contract).
- **PWA service worker is NETWORK-FIRST, never cache-first** (`public/sw.js`), subpath-scoped to
  `/golf-stars/` — offline play without resurrecting the stale-serve blank-page bug; a fresh deploy
  always wins online. Bump `VERSION` per deploy. The foreign-SW/cache cleanup in `index.html` is
  narrowed to kill only NON-`golf-stars-*` workers/caches so golf-finder coexistence holds. Full
  rationale: `docs/decisions/process-and-deploy.md`.
- **Google Play ships the SAME web build wrapped in Capacitor** (GS-android, full story:
  `docs/decisions/android-packaging.md`). `webDir` is `dist/` — the native shell adds NO game code and
  the browser build is unaffected. Two rules: the app id `com.foxorama.golfstars` is **permanent** (Play
  keys the listing on it), and the **service worker MUST stay disabled in the shell**
  (`isNativeShell()` in `app.ts`) — Capacitor serves from `https://localhost`, which passes the protocol
  guard, so an un-gated worker would cache already-local assets and resurrect the stale-serve bug with no
  hard-refresh to escape it. `npm run android:apk` to sideload, `android:aab` for Play; the `android`
  workflow is NOT a required check. Launcher art has ONE source (`public/icon-512.png` →
  `scripts/android-assets.mjs`).
  **The sideload build is a RELEASE APK signed with the upload key, never `assembleDebug`** — a debug
  APK carries the *runner's* throwaway certificate, and Android refuses to update a package whose
  signature changed ("app failed to update"). Every artifact step stamps `ANDROID_VERSION_CODE` /
  `_NAME`; a step that forgets ships `versionCode 1` and is a downgrade. Local debug / CI debug /
  release are three DIFFERENT signatures — pick one channel per device. With no keystore secret the
  job still builds (forks need that) but must stay LOUD: warning + run summary + an artifact NAMED
  `…-UNSIGNED-cannot-update-existing-install`, because the silent-green keyless build is what cost a
  play-test session.
- **BACK is ONE pure decision** (GS-android-back, `ui/back.ts backIntent`) — the Android hardware
  button AND desktop Escape route through it, never a fork. Four tiers: dismiss the topmost overlay →
  navigate to the parent *using the screen's own back action* → **swallow** on forward-only beats
  (skipping one would let a player dodge a reward pick / desync `seenStoryBeats`) → confirm, but ONLY
  in a run. **`title` is the only screen that may close the app.** `screenIntent` ends in a `never`
  guard, so a new `Screen` fails to COMPILE until back is decided for it. The confirm is NOT a
  data-loss warning — `toTitle` already parks the run as `resumable`; `exitPrompt` says the true
  thing instead (strokeplay resumes on the hole, other formats replay the stop) and a test forbids
  the word "lose". Reuses `.gs-sheet` chrome ⇒ zero new global CSS.
  **AN ON-SCREEN BACK BUTTON DISPATCHES WHAT `backIntent` ANSWERS FOR ITS SCREEN** (GS-story-back-dead) —
  every navigation action is `state.screen`-guarded, so a button carrying a NEIGHBOUR screen's action is
  not a wrong destination, it is a **DEAD BUTTON**: the reducer returns the same state and nothing at all
  happens. The trap is a module that renders TWO screens — `storyScreens.ts` serves the story HUB *and*
  the golfer picker (screen `character`), and the picker shipped with the hub's `exitStory`, which is
  guarded to `screen === 'story'`. Every other back action's module name matches its guarded screen; when
  one doesn't, check it. And **`toTitle` must leave no screen-local state behind** — it is the single exit
  from the picker (its button, hardware BACK, and the settings sheet's escape hatch all land there), so it
  clears `pendingStoryNew`/`storyInspectId`/`storyOverwriteId` beside `pendingExit`; carried onto the
  title, `pendingStoryNew` would dress the NEXT Voyage's character select as the Story clubhouse and turn
  picking a golfer into creating a campaign. Guarded by `tests/story-campaign-picker.test.ts` (the button's
  own `data-action` is parsed out of the rendered HTML, compared to `backIntent`, and reduced — a back
  action that returns the same state fails).

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
the NETWORK-first, subpath-scoped PWA SW above — the inverse of golf-finder's cache-first offline SW,
not a re-coupling of the two apps.)
