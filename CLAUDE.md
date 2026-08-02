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
- `DEVLOG-IDEAS.md` is the same living doc for devlog posts (`DL-*` ids, published → link). An entry
  earns its place by having **material** — the specific thing that happened, and where the evidence
  is — never a topic. Two standing rules it exists to enforce: **state facts, don't argue** (the AI
  question attracts a defensive register, and an argument invites one back), and **check the claim
  against the code before publishing it** — a wrong-but-better story once reached a chat summary, a
  commit message, a PR body and a source comment on `main` before anyone re-read the file
  (`DL-guard-caught-it`).

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
  played on `STROKEPLAY_FORMAT`, so the format alone files it under Star Tour); **`state.runSlots` is a
  faithful SUPERSET of the save — it may lead it, never trail it** (GS-resume-slot-loss): `resume` used
  to `clearSlot` the run it picked up ("the offer is consumed"), but `resumableState` builds the save
  from the table PLUS THE LIVE RUN, so the clear survived only while the live run was still that
  golfer's — and `‹ Change golfer` exists to make it somebody else's, so the next persist wrote a save
  with no trace of the run. Clearing was never load-bearing (the upsert rewrites that slot every
  persist); only a confirmed start-over or a run ENDING may remove an entry. ⚠️ A reducer test asserting
  on `state.runSlots` alone is asserting on a CACHE — assert through `resumableState` (the `saved()`
  helper), and note that every walkthrough routed via `toTitle` HEALS the table, which is exactly why
  three tests pinned the broken behaviour and none caught it; `slotTag() === null` is
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
  else's card. **Every exit says what leaving costs, from `resumePromise`** — `hole` / `forfeit`
  (Asgard, the ONE exception left) — the back confirm AND the settings footer, which used to promise
  something vaguer. Guarded by `tests/save-slots.test.ts`.
  **AND A STORY WORLD ROUND KEEPS ITS HOLE TOO, SO "EVERY MODE" IS A DESCRIPTION NOT AN ASPIRATION**
  (GS-story-round-resume, save `STORY_VERSION` 8, `StoryState.liveRound` · `ui/resumable.ts
  campaignWithLiveRound`). The third `ResumeCost`, `world` (campaign saved, ROUND replayed from its
  first tee), was an honest promise about a behaviour that was simply too harsh — eighteen holes in,
  stopping for any reason cost the lot — so the BEHAVIOUR changed rather than the wording, and `world`
  is retired. Story owns no run slot by design (GS-save-slots kept `fc_save`/`fc_story` apart), so the
  round rides the CAMPAIGN it belongs to. **It is REBUILT, never snapshotted**: a story round is fully
  determined by the campaign + which world + which partner (the qualifier plan is a pure hash off
  `campaignSeed`), so `buildStoryWorldRun` is ONE builder both the tee-off and the resume call — a
  second one would resume you into a different bag, sky, or *scoring format*. `campaignWithLiveRound`
  is the `fc_story` twin of `resumableState` and BOTH writers call it (`persistStory` + `toTitle`):
  writing the round to disk without folding it into `state.campaigns` is exactly GS-resume-slot-loss,
  because the picker reads state. A finished/abandoned round REMOVES the field (never a stale offer),
  and a `liveRound` whose hole the rebuilt course can't serve falls back to the hub — a
  `GENERATOR_VERSION` bump re-rolls a static course, and a tee that can't be built must not strand a
  campaign. No `BACKUP_VERSION` bump (the roster's SHAPE is unchanged); a v8 campaign meeting a v7
  build is refused loudly by `campaignStoreTooNew`, which is precisely what GS-save-integrity is for.
  Guarded by `tests/story-flow.test.ts`.
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
  **AN EXPORT IS THE ONLY DURABLE COPY, AND NOTHING EVER ASKED FOR ONE** (GS-backup-nudge, save v34,
  `save/backup.ts backupNudge` pure). `localStorage` is the only copy the game keeps, every browser
  evicts (iOS Safari clears script-writeable storage after 7 idle days) and on itch the quota is
  SHARED with the platform — so the players who most need a backup are exactly the ones who have never
  opened Settings. `lastExportRun` stores `clubhouseVisit` (already bumped once per finished run) AT
  THE MOMENT OF EXPORT, so the nudge counts RUNS, not days: the unit a player feels is progress made,
  and a counter needs no clock, no timezone and no trust in the device's date. **What the tests mostly
  guard is the SILENCE** — null for a save with no finished run behind it (nothing to lose) and for one
  exported this run (nagging someone who just did the thing is how a warning becomes wallpaper, in the
  very section holding the alert that must never be ignored); urgent only past
  `BACKUP_NUDGE_URGENT_RUNS`. Stamped ONLY on a CONFIRMED success (`downloadBackup` returning true, a
  clipboard write resolving) — a nudge silenced by a backup that never landed is worse than one that
  never fired. A counter that ran backwards reads as up-to-date, never as a huge overdue.
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
  - **ASGARD interlude** (`docs/decisions/asgard.md`; GS-asgard) — an eagle-or-better on the Rainbow Course opens
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
  - **THE CREDITS ROLL IS A CARD PER CHARACTER, AND EVERY CARD KNOWS WHICH ENDING IT IS ROLLING ON**
    (GS-story-credits, `sim/rpg/storyCredits.ts` pure · `app/storyCreditsScreens.ts` the `.gs-cred*` screen).
    The finale recap has offered *"Roll the credits ›"* since the finale shipped and went straight to the
    title — the campaign's last promise was the one thing it never delivered. A Mallrats "where are they now"
    card per cast member now sits between them (`storyCredits` → `endStoryCredits` → title). **Every row
    carries BOTH epilogues** (a Warden win wakes the galaxy, a Herald win puts it to sleep — one shared set
    would be false on whichever road you didn't take, and a credits roll that lies about its own ending is
    worse than none; machine-checked that no epilogue is shared). **A friend's ROLE is asked, never
    re-derived** — `betrayerId` on the Warden road, `heraldSeveredId` on the Coil one, the same seams the
    ending recap read one screen earlier, so the roll can't name a different traitor than the ending did.
    **The hero's card is SECOND PERSON**: the protagonist is a PICK, so any third-person pronoun misgenders
    three quarters of the players (GS-story-neutral-address) — a test forbids all of them on that card. The
    token→portrait rule MOVED out of `loreScreens.ts` into the shared `render/castPortrait.ts` (two askers,
    GS-one-description) and gained `agent:<id>`, which reads a Coil agent's bust + tint off its OWN
    `HeraldAgent` row. **The crawl is a rAF loop, never a CSS animation** — `.gs-reduced` collapses every
    animation DURATION, so a keyframed crawl would SNAP TO THE END for exactly the players who asked for
    less motion; it never starts under reduced motion and the roll still reads, scrolls and reaches its own
    "The End" by hand. It scrolls INSIDE itself (the embed's page frame can't — GS-embed-scroll) with a
    deliberately LOW height floor: `--gs-dvh` divides by the UI scale so the reserve is constant in UNITS
    but a px floor is not, and 280px pushed the roll off a 320×568 screen at the top reader rung. Back is a
    NAVIGATE, not a swallow — the campaign is banked before the roll starts, so there is nothing to skip.
    Guarded by `tests/story-credits.test.ts` + `?screen=storycredits|storycreditsherald` smokes.

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
  - **AND THE GATE IS ON THE APPLICATION, NOT THE SIGN** (GS-spin-bag). GS-spin-gate stopped over-spun long
    clubs going NEGATIVE and left them at a **dead stop** — which is still no roll, and **no roll is no
    BOUNCE**: `planRunout` gets `dist: 0`, the air budget is 0, and the train breaks before the first hop.
    Read off a real save, ONE Milled Tour Wedge (+0.06 — a WEDGE-slot item whose own copy says *"so
    approaches check up"*) took the driver's run fraction **0.140 → 0.080**, the 3-hybrid to 0.015, and the
    7-iron and 8-iron to **zero**. That is the play-test's *"the save I was playing with shows no bounce"*,
    on the one campaign with story gear equipped — the same golfer bounced fine in every other mode.
    `backspinBoost` is now withheld from clubs above `hasBackspin` entirely, so a wedge item can never
    touch a driver. ⚠️ **Only the GEAR is gated, and that is not a half-measure**: a character's
    `rollFracDelta` is ALREADY per-club — Bo's `clubMods` returns nothing above the five-iron, and every AI
    golfer's is scaled by `(1 − t)` to zero at the driver — so gating it here too would flatten a smooth
    taper across the mid irons for every golfer, a balance change dressed as a bug fix. The old ungated
    behaviour was FUN on cetus/void/rainbow (run is a liability on island worlds), so it survives as
    `RoundOpts.spinsWholeBag`, off, wired through `backspinRoll` too so the drawn helper line agrees
    (contract 5) — a build to be CHOSEN, one row away (`GS-spin-bag-build` in IDEAS). Default loadouts have
    `backspinBoost: 0`, so the whole suite and the death-spiral harness are byte-for-byte. Guarded by
    `tests/roll.test.ts` — and note that guard may only compare the PREFIX before a wedge, because a spin
    build genuinely re-routes the hole from there.
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
  - **A HOP'S LENGTH IS `sin(2·descent)`, AND WHETHER IT IS PLANNED IS A QUESTION ABOUT PIXELS**
    (GS-runout-seen). Two faults behind *"woods, hybrids and long irons don't really have any bounce
    animation, they land and just stick"* — hops PLANNED and then not DRAWN (firm fairway: a driver
    planned 6 and drew 2, a 4H planned 3 and drew 1; on a green `seen` was **1 on all 40 rows**).
    **The length term was `cos²(θ)`, which is neither half of the projectile pair the module already
    relies on**: a projectile ranges `v²sin2θ/g` and peaks at `v²sin²θ/2g`, and `apexOverLenFor` has
    been their RATIO (`tan θ/4`) since GS-runout-visible — so the geometry was right in two places and
    contradicted in the third. `sin2θ` is FLAT across the bag (0.97 at 38° → 0.99 at 50°) where `cos²θ`
    collapses (0.62 → 0.41), so every steep-landing club was charged a penalty the physics does not —
    **on top of the one `RUNOUT_BY_CLASS.len` already charges for the same steepness.** `hopBite` is
    that relation; `hopLenK` 0.07 → **0.0448** is a re-normalisation pinned so the DRIVER is
    arithmetically unchanged (it already read right — a test says so, and moving `hopLenK` moves the
    driver). `ironShort.len` 0.8 → 0.93 follows, because with `cos²` gone the class row is the only
    place a short iron's bite is expressed. And **a length in YARDS cannot answer "will this be seen"**
    — the camera frames the shot, so 0.75yd is 3.7px behind a 9-iron and 0.8px behind a drive, and
    neither a yard floor nor a share-of-the-run-out floor separates the measured pair (keep a 9i's
    0.744yd at 3.6px, drop a 4H's 0.761yd at 1.8px). Rather than re-derive the camera from `carry` — a
    second description of `project.ts` — the caller passes `Landing.ballYd`, the drawn ball's radius in
    yards of modelled apex, i.e. the play view's own `height·scale·heightExaggeration·hopDrawBoost` run
    BACKWARDS. A hop under it is not planned and its ground goes to the ROLL; the FIRST hop is exempt
    (a ball out of the sky does not begin by rolling) and ABSENT ⇒ the old `hopMinYd` floor, which is
    what keeps the pure tests measuring the untrimmed MODEL. Result: `seen == planned` on **all 40**
    firm rows (driver→9i all draw 2 on a full swing; the 1s are 30–66yd partials and the wedges) and an
    honest 1-and-roll on all 40 green rows. **Render-only — no sim module imports `runout.ts`, zero
    carry moved, the harness has nothing to weigh.** Guarded by `tests/runout.test.ts`; eyes-on
    `scripts/landing-preview.mjs` (which now passes `ballYd`, so the sheet shows what SHIPS).
  - **⚠️ THE LANDING PUSH-IN IS RETIRED — `landingZoom` IS 1** (play-tested and rejected: *"the weird
    zoom on ball flight ending is weird… it takes the focus completely away from where the ball is
    ending"*). It reasoned correctly about SCALE and ignored the cost: a camera moving through the
    landing is one the eye must re-acquire the ball against, at the moment it is reading a small fast
    arc. Three passes measured the bounce getting bigger and none could see it getting harder to watch.
    **The DEAD-ZONE hold stays** — that is not a zoom, it is the camera ceasing to chase the ball, and it
    is the actual fix. At the flight camera the driver still draws **4 bounces, first lift 11.2px over a
    2.3px ball** against the ~5.3px of the last state the play-test called good, and the ball now travels
    the full 61px instead of being pinned. Cost: the part-power tail (`D @0.85` → 3), so the band is
    asserted on a FULL swing, which is what it always described. `landingZoomFor` + the constant are kept
    DORMANT (the rig measures through `GS_LANDING_ZOOM`, `_gsFeel` makes a gentler version a console
    line); a test pins the shipped 1 so it cannot return by drift. **THE ROOT CAUSE, five passes back:
    #612 fixed the arrival speed 0.0067 → 0.28 yd/ms (42×) — a real bug, and accidentally the entire
    reason the bounce read well, since a hop's duration is `distance/speed` and every hop became 1/42 as
    long.** Seven subsequent passes compensated in height, length, count and scale; the only one that
    mattered was the dead-zone camera, because it was the only one addressing what the fix destroyed —
    the ball's MOTION through the bounce, not its size. **When a fix upstream silently removes the thing
    that was making a feature work, no amount of tuning the feature will find it.** Full story in
    `docs/decisions/putting.md`. The bullet below is kept for the machinery it describes, which is still
    live and still the seam both the camera and `ballYd` read.
  - **THE LANDING IS WATCHED FROM THE LANDING** (GS-landing-camera, `RunoutFeel.landingZoom` ·
    `landingZoomFor`). Four passes read *"there's no ball bounce visible anywhere"* as a question about the
    bounce MODEL and each found a real fault in it; the model was never the problem. `decisionReach` frames
    the camera for the WHOLE shot (~1.6 px/yd on the composed phone), so a driver's 38-yard run-out was drawn
    into **61 screen pixels** — and at `runoutTimeScale` 0.16 (≈1.3× REAL time, under a flight playing at 8×)
    it crossed them in 3.1s, **a third of a pixel per frame**. Measured, ALL FORTY club/power/surface rows
    came in under 1 px/frame: the ball was not travelling, it was being redrawn in the same place. Six bounces
    cannot be shown in sixty-one pixels whatever the apex is. So the camera **pushes in** over the last 240ms
    of the flight and holds for the run-out (riding `cineZoom`, the redirect cinematic's own lever — no second
    camera), and the clock roughly doubles (`runoutTimeScale` 0.30, `runoutMaxMs` 2300): driver **61 → 179px**
    and **0.33 → 4.90 px/frame**. It also mostly RESTORES the continuity the slow clock had to break —
    apparent speed is yd/ms **times** px/yd, so the first hop now leaves at **0.90** of the ball's arrival
    speed against 0.12; the velocity cliff at touchdown was largely a CAMERA cliff, which is why the clock
    could never have fixed it alone. ⚠️ **`ballYd` must be asked at the LANDING camera** — it is how the plan
    decides a hop is too small to be seen (GS-runout-seen), and asked at the flight camera the push-in arrives
    to find the tail already thrown away; `landingZoomFor` is the ONE seam the push-in and the plan both read.
    Three latent bugs it forced out: the zoom **never settled** (the follow-cam's key is an exact
    `cineZoom !== projZoom` against an exponential ease ⇒ a full ~100k-op world repaint every frame for ever,
    GS-shot-lag — `CAMERA_SETTLE_ZOOM` is `CAMERA_SETTLE_PX`'s twin); the zoom must be **handed back** per
    shot and on entering the putt phase (a redirect returns to 1 inside its own flight, a landing zoom is the
    last thing that happens to its shot); and `landingMinRadiusYd` stops a chip — already at the camera's own
    30-yard floor — being pushed tighter than the putt screen. Render-only (no `src/sim/` module imports
    `runout.ts`): zero carry, zero draws, nothing for the harness to weigh. NOT gated by reduced motion —
    that would hide the landing from the players who asked for less motion — so it is a glide, not a snap.
    ⚠️ **The eyes-on rig is how this survived four passes**: `landing-preview.mjs` drew every sheet at a
    hand-set 4.6 px/yd while the game drew 1.6, i.e. it was honest about the model and silently wrong about
    the picture. It takes the camera from the shipped constant now. Guarded by `tests/runout.test.ts`;
    measured by `scripts/runout-frames.ts` (`GS_LANDING_ZOOM=1` reproduces the reported baseline).
  - **A HOP FLATTER THAN IT IS LONG IS NOT A BOUNCE** (GS-bounce-flat, `apexOverLenMin`). A play-test named
    the clubs that don't bounce — *"drivers/woods/hybrids/long irons; short irons and wedges seem ok"* — and
    the split is EXACT. `apexOverLen · heightExaggeration · hopDrawBoost` is the hop's DRAWN height÷length,
    and it read **D 0.70 · 3W 0.72 · 4H 0.96 · 3i 0.96** against **7i 1.07 · 9i 1.14 · PW 1.19 · SW 1.38**:
    every club under 1.0 was on the list and every club over it was not. Flatter than it is long reads as a
    smear; taller reads as a bounce. It is a property of the DESCENT ANGLE (`tan θ/4` — a driver arrives at
    38° and skids, a wedge at 57° and pops), so a uniform `hopDrawBoost` under-serves precisely the clubs
    that land flattest and raising it puts the wedge into a real pop-up before it rescues the driver.
    `apexOverLenMin` 0.12 → **0.30** = the 7-iron's own 1.07, i.e. the ratio the play-test says already
    reads right; steeper clubs keep their bigger ratio, so the character survives. ⚠️ **The floor must act
    on the APEX, not only on `apexOverLenFor`'s clamp** — for shallow clubs the modelled apex
    (`hopApexK·carry·sin²θ·kv`) undershoots the cap and binds first, so clamping alone brought every club to
    1.07 and left the DRIVER at 0.96. Result: D **5** bounces at 17.3px, ladder 5▸4▸3▸2▸2▸1 held, 0/40
    outside band. Height is a READABILITY constant; firmness still governs the COUNT and the LENGTH (driver
    5 on a firm fairway, 2 on a soft green), which is what makes greens bounce "depending on firmness".
    ⚠️⚠️ **THE GUARD WAS POINTING THE WRONG WAY AND HAD BEEN FOR THREE PASSES** — it asserted the driver's
    ratio stayed BELOW 0.55, then below a 1:1.4 "pop-up line" that was a guess hardened into a constant. The
    refutation was in the data all along: **the SW has drawn 1.38 since GS-runout-visible and is one of the
    clubs called RIGHT.** Any pass could have raised the boost; none could, because the test would have gone
    red. A guard built on an unvalidated threshold defends the bug. The band is measured now (≥1.0, <1.45)
    and asked of the REAL bag, never hand-picked angles. `runout-frames.ts` prints the `ratio` column.
  - **A BOUNCE THAT DOES NOT TRAVEL IS NOT A BOUNCE** (GS-runout-clock, `runoutCameraTarget` ·
    `runoutLeashFrac`). Six passes read *"there's no ball bounce visible"* as a question about the bounce
    MODEL and every one measured green; the yards were right the whole time. The instrument that settled it
    hooks `drawBall`'s gradient + `drawBallShadow`'s ellipse in a real browser and records both per frame —
    their difference is the LIFT, the one quantity the camera cannot confuse. It found two things no
    plan-space rig can see. **The ball never moved forward**: the follow-cam eases at 0.2/frame, which the
    ball outruns in flight and NOT AT ALL on the ground, so the whole run-out was drawn as *the world
    scrolling behind a pinned ball* — total screen travel over the closing roll, **2.6 pixels** — leaving a
    14px vertical bob in place. And **the hops were played at 100ms, not their planned 130**: `sampleRunout`
    maps `t` over the RAW hop+roll total while the play view drives off `totalMs`, so a run-out tripping
    `runoutMaxMs` plays uniformly faster and the compression lands on the hops, which sit on `hopMinMs` and
    have no slack. (`runout-frames.ts` had been printing `timeBase 0.65` throughout, read as "a uniform
    stretch (harmless)".) So the camera **LETS GO at touchdown** — a dead-zone camera holding the pitch mark
    inside a leash of 0.3 frames and dragged along past it, so a monster run-out can never leave the frame —
    and `runoutMaxMs` 2300 → **3000** (a safety net, never a pacing dial; a test pins that every family's
    full-power shot fits under it) with `hopMinMs` 130 → **100**. Measured in game: roll travel **2.6 →
    60px**, roll step **0.004 → 1.17 px/frame**, hops compressed **40/40 → 0/40**; the LIFTS are unchanged,
    which is the point. ⚠️ **Trimming the ROLL to fit instead is the obvious fix and it is WRONG** — the
    roll's duration is `2·rollDist/vLast`, pinned by the speed it inherits, so shortening it makes the ball
    ACCELERATE out of its last bounce (caught by the hop→roll join guard within a minute). Uniform
    compression is the only step-free way to shorten a run-out, so the fix had to be to stop needing one.
    A still camera also lets the scene cache hold (GS-shot-lag), so this is the one part of a shot that can
    run at full frame rate. **⚠️ THE LESSON, NOW THREE DEEP**: `landing-preview.mjs` drew at a camera the
    game does not use, `runout-frames.ts` reasons in the plan's own units and cannot see a camera cancelling
    the motion it measures — **neither rig could have found this and both reported success.** When a report
    survives a fix that measured green, stop improving the measurement of the MODEL and go measure the
    PICTURE. **AND THE CAMERA HAS TO ARRIVE BEFORE THE BALL DOES** (round 2): the dead-zone gate is
    `landingCam`, NOT `rollPhase` — switched at touchdown the camera is still ~16px behind the ball it
    chased all flight and spends the FIRST AND BIGGEST HOP catching up, panning forward faster than the
    ball skips, so that hop was drawn moving 16px BACKWARDS. A bounce drawn the wrong way is worse than
    one drawn still. It eases onto the pitch mark over `landingZoomLeadMs` (300) so the ball flies into a
    frame that has already stopped. `hopDrawBoost` 5.4 → **6.5** takes the drawn height:length ratio TO
    the 1:1.4 line its own comment names as the limit and stops there — the line was set against a PINNED
    ball, where a hop was a vertical bob and a tall bob reads as a pop; an ARC across the frame reads as a
    skip much further up the ratio. Driver cap 6 → **5** and wood 5 → **4** keep the ladder STEPPING once
    the taller arc pushed more hops over the visibility floor (and keep the driver clear of the ceiling).
    Measured: hops **4 → 5**, lifts **14/10/6/4 → 18/12/7.5/4.5/2.8px**, hop-phase travel **−16px → +61px**.
    ⚠️ `hopMinMs`'s comment has now been wrong in BOTH directions ("paid for twice by the roll", then
    "the roll does not move") — `vRoll` is `min(chained, drawn)` and which binds is a property of the
    TRAIN, so the guard is the MONOTONIC rule (raising the floor can lengthen both, shorten neither).
    A directional claim about a `min` is a claim about which side is smaller, i.e. the thing that moves
    when any other constant does. Guarded by `tests/runout.test.ts`.
  - **HOW MANY TIMES A BALL SKIPS IS A PROPERTY OF THE CLUB** (GS-bounce-ladder,
    `RunoutClassProfile.hops` · `RunoutFeel.trainSustain`). The play-test's ladder — driver 4-6 ▸ wood 3-5 ▸
    hybrid 2-4 ▸ long iron 1-3 ▸ short iron 1-2 ▸ wedge 0-1 — had no home: `hopMax` was ONE number for the
    whole bag, so what actually decided the count was where the geometric train fell under the drawability
    floor (`ballYd`), and **that floor is a fact about the CAMERA, not the club** — short clubs are watched
    from closer in, so GS-landing-camera moved every floor at once and the short irons gained a third skip
    with nothing about the golf having changed. `hops` is a ROW beside the club's bite and pop, compile-forced
    by the `Record<FlightClass,…>`; `hopMax` stays the absolute ceiling + the live `_gsFeel` lever
    (`min(hopMax, cls.hops)`). The hybrid sits at **3**, under its permitted 4, because **counts in band are
    not enough — the ladder must STEP**: a hybrid skipping as often as a 3-wood is in band for both and reads
    as no ladder at all. `trainSustain` 1.1 buys the driver its 5th skip (`kh²` ≈ 0.55 left hop 5 five inches
    short of the threshold) and is the same admission `hopDrawBoost` makes about HEIGHT — **the train is
    drawn, not simulated**. ⚠️ `kh²` was ALREADY an exaggeration nobody had named: a projectile ranges
    `2·vh·vv/g`, so the honest length decay is **`kh·kv`** (0.39 for a firm driver, vs `kh²`'s 0.59). ONE
    number, not a table, because `kh` already ladders by family (measured per-class gains 1.13–1.27, i.e.
    flat) — and it **MULTIPLIES** the physical rate rather than replacing it, which is what keeps the SURFACE
    in charge (a drive plugging into rough decays at 0.25 and still dies in two; a flat authored decay would
    have it skipping five times). Measured: **0/40 firm rows outside the band at every power** (was 6),
    ladder 5 ▸ 4 ▸ 3 ▸ 2 ▸ 2 ▸ 1. The band is a FIRM-ground promise — on a soft green a driver correctly
    comes down to two, and holding the ladder there would be the bug. Render-only; the SPEED chain
    (`v *= khRun`) is untouched, so the touchdown continuity is exactly as GS-landing-camera left it.
    Guarded by `tests/runout.test.ts`; measured by `scripts/runout-frames.ts`.
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
  - **A PICTURE THAT CANNOT HAVE CHANGED IS NOT REDRAWN** (GS-shot-lag, `playView.ts drawStatic`).
    Painting the world is **~100,000 canvas ops** — two orders of magnitude past the ~1,500 prims
    `buildScene` returns, because most of it lives inside `clip` groups, and it peaks at the PUTT
    camera where the green's mow/apron/isolines/relief all resolve at maximum zoom. `drawStatic` cached
    the built prims by projector identity but re-stroked all of them every frame anyway: the putt watch
    ran at **3.3 fps** (12× throttle) and the green was the laggiest screen in the game. Three rules
    now. **The painted scene is cached in an offscreen canvas and blitted while the projector is
    unchanged** — byte-identical by construction (same prims, same painter, different surface), and a
    MOVING camera skips the offscreen entirely because painting it as well as the frame is strictly
    more work. **The follow-cam must be able to ARRIVE**: the ease is exponential and `buildProj()`
    mints a new projector every frame, so the key changed on every frame of every shot for ever — under
    `CAMERA_SETTLE_PX` (0.05 **screen** px; a yard threshold means something different at every zoom)
    it SNAPS onto the ball and stops. And **`hashHole` is memoized** — a hole is immutable but its art
    seed was re-derived hundreds of times per scene (once per ground patch via `patchRng`), measured at
    **13.4% of ALL CPU**. Putt watch **3.3 → 59.9 fps**, shot watch **12 → 30**, steady-state ops/frame
    **97,477 → 128**. ⚠️ The offscreen takes `canvas.width`, NEVER a re-derived `width * dpr`: `dpr`
    folds in the UI zoom and is fractional, a canvas width attribute TRUNCATES, and a device-pixel
    disagreement resamples the whole world. ⚠️ **It is not a leak** — rAF loops, DOM nodes, listeners
    and post-GC heap were all measured flat/falling (`scripts/leak-probe.mjs`); what grows with a
    session is hole wildness and SoC temperature. Guarded by `tests/play-scene-cache.test.ts` (a
    canvas-op census, confirmed to fail at 97,477 on the old path — never a frame-rate assertion).
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
  - **A HOLED BALL FINISHES IN THE CUP, AND THAT IS WHAT LETS THE CUP BE A CUP** (GS-cup-real,
    `sim/round.ts finishInCup` · `render/ball.ts cupRadiusPx`). `HOLE_OUT_RADIUS` is **1.2 YARDS** — a
    generosity in the RULES, ~20× a real hole — and the drawn cup was pinned to it, so at the chip
    cameras the hole came out 13–16px across against a ball drawn at 5.4: *"way too large… probably
    twice as large as it should be in green and green make view"*, and a ball running over that much
    black without dropping read as a bug rather than as golf. It was pinned there for a reason and the
    reason is now gone. The cup had to cover the catch radius because a ball could be **holed while
    drawn lying outside it** — but the putt resolvers have snapped to the pin since
    GS-putt-holed-position and the chip-in has trickled in since GS-chipin-roll; the ORDINARY shot
    (`dist(rest,pin) ≤ HOLE_OUT_RADIUS`) was the one path that never got the rule, and it left the ball
    up to 1.2yd (7–17 screen px) to one side of a hole it had supposedly gone into. `finishInCup` is
    that one seam, shared by both branches — pure geometry after a decided outcome, **zero rng, zero
    strokes moved**, so every seeded stream and the harness are byte-for-byte. **The drawn cup then
    gets its OWN size curve** (floor + sqrt growth + cap, the ball's SHAPE with deliberately different
    constants): the ball is read against nothing, the cup against the GREEN and the pin beside it, so
    carrying the ball's ~11× exaggeration is exactly what made a crater. Drawn width falls 2.4yd → 0.29yd
    as you zoom — closer to the truth the closer you look. Chip camera **6.84 → 3.20px**, green **8.21
    → 4.07**, fairway 2.40 → 1.95. **Two ceilings survive and are now slack at every camera, kept
    because they are the RULES, not the arithmetic**: never wider than the radius that CATCHES (it
    still binds below ~1.35 px/yd, where it drives the cup to nothing — from 300 yards you should not
    see the hole, the FLAG marks the pin) and never past `ball × CUP_MAX_RATIO`. ⚠️ It must stay WIDER
    THAN THE BALL at the cameras you hole out at (1.28–1.5×), or a ball on the lip hides the hole —
    the original GS-cup-scale bug. **The FLAGSTICK grows with it**: a real 7-foot pin in yards, FLOORED
    at the flat 14 units it always was (every fairway camera byte-for-byte, and out there it is a
    marker, not a stick) and capped at 30, because it had been standing shorter than the hole beside it
    was wide. Guarded by `tests/cup-and-swallow.test.ts`; eyes-on `scripts/cup-preview.mjs` (which
    renders at the DESIGN frame — a smaller cell mislabels every camera).
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
    **AND A FAIRWAY POLYGON IS NOT THE SHAPE OF THE CUT GRASS** (GS-fairway-ink-break) — the corridor runs
    on UNDER the green, and hazards are cut out of it and painted OVER it, so an outline that asks only
    "does another FAIRWAY bury this?" draws ink across the putting surface, along a bunker floor and
    through a creek. Measured over 2,925 holes: **2.28% of all ink length inside a green (77% of holes)
    and 7.86% inside a hazard (87%)** — every family, led by bunkers/creeks/water — now **0%** and
    **0.06%** (the remainder is the ≤4yd close stitching over a nick, which is the anti-dashing rule
    doing its job). `fairwayEdgeRuns` takes OCCLUDERS that bury edge exactly as a neighbouring fairway
    does, grown by the same `bleed` so ink stops just short of a rim instead of leaving specks along the
    sand. They are the SAME bodies the painters get — `mergedHazardsFor` + the roughened liquid banks,
    hoisted to the top of `buildScene` (both are course-space, CACHED and rng-free, so no draw is
    reordered and every seeded scene is byte-for-byte). **TREES ARE DELIBERATELY NOT OCCLUDERS**: a
    canopy is a sprite with gaps over turf that is still cut grass, and burying edge under one shreds the
    outline into dashes wherever a grove overhangs. No occluders passed ⇒ byte-for-byte, so the
    single-poly early return survives — but it now yields when an occluder crosses a lone fairway, which
    it used to swallow. ⚠️ Most of the removed ink was ALREADY INVISIBLE (hazards and the green paint
    over the fairway pass): the pixel win is small and real — ~500px on a whole-hole map, concentrated
    exactly at the green — while the structural win is that the silhouette now means what it says.
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
  - **AND THE OTHER END OF THE BAND IS THE CAMERA'S REACH** (GS-decision-frame-carry, `decisionReach` ·
    `project.ts radiusForSpan`). The rule above framed the ball clear of the BOTTOM panel and nothing ever
    read `band.top`, so the far end of the shot was drawn straight through the info bar. Two faults
    compounded. **The reach was fed a CARRY when the ball finishes at the TOTAL** — `spray.carryHigh`, when
    since GS-runout-ladder a driver runs a further 14% of it (wood 10.5%, hybrid 7.5%, iron 5.5–6.5%, wedge
    ≈0): the exact trap GS-carry-roll-real names, and the sim already had the fold two files away. It is now
    ONE seam, `round.ts sprayTotalHigh`, asked by the club suggestion (does the ball stop by the back?) and
    by the camera (where does it come to rest?). **And the reach was a CONSTANT**, which cannot work,
    because how much room the HUD leaves is a property of the DEVICE: the play frame is capped to
    `--gs-portrait-w`, so a desktop container is a SHORT strip and the same 0.36 that left 130 frame units
    spare on a 390×844 phone ran out entirely on the itch embed's 820×760. Measured on the built game
    (`scripts/play-frame-probe.mjs`), the drawn cone sat **54px behind the bar** on a 320×568 phone and a
    driver's furthest resting point **2px under it** on the embed. The radius is now solved from the span
    the HUD actually leaves — ball row to band top, `SHOT_BAND_FILL` 0.8 of it, the rest headroom (fill it
    exactly and the far end sits ON the bar's edge, which reads as clipped). Each device gets the tightest
    zoom that still shows the whole shot: cone clearance 320×568 **−54 → +90px**, embed +51 → **+147**,
    laptop +52 → **+149**, and the composed-for phone barely moves (+127 → +168, a 9.5% zoom-out) because it
    had the room all along. Falls back to the classic constant while the band is unmeasured. ⚠️ A pure test
    can only re-derive the rule from its two measured inputs — that is a SECOND DESCRIPTION, so the guard
    that matters is the BROWSER one (`tests/map-frame.test.ts`, the itch embed + the 320px phone): it fails
    on the old camera with the measured −54px. Eyes-on `scripts/play-frame-shot.mjs`.
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
  - **EVERY DISPLAY LAYS OUT AS THE PHONE THE GAME IS COMPOSED FOR** (GS-ui-display-scale,
    `app/viewportFit.ts displayScale`). The lore/beat screens are `--gs-portrait-w` (a fraction of the
    viewport HEIGHT) so they always grew; the ~20 ordinary flow screens are `.gs-main` at a fixed 820px
    with inner caps and ~660 hard-px sizes, so NOTHING about them was height-derived and nothing grew —
    at 1920×1080 the Star Tour recap was a **460×442 island of phone-sized UI**. `--gs-uiscale` is now
    `calc(var(--gs-readerscale) * var(--gs-displayscale))`: settings writes the reader half,
    `viewportFit.ts` (the ONLY module allowed to compute a scaled viewport) writes
    `clamp(1, min(w/390, h/844), 1.5)`. It **MULTIPLIES, never replaces** — the player owns their type —
    so nothing may write the combined token (an inline root property beats the stylesheet and would
    delete the other half) and nothing may READ it (an unregistered custom property computes to its token
    stream, so `Number(getPropertyValue(…))` is **NaN**; ask `rootZoom()`). BOTH axes, because a viewport
    proportionally NARROWER than the phone would be zoomed on its height alone and handed 329 units of
    width — under `TIGHT_W`, reflowing the play HUD on a device that was fine. ⚠ **`--gs-portrait-w` is
    deliberately NOT multiplied back**: it is `0.52 · dvh` and `--gs-dvh` already divides by the zoom, so
    the frame RENDERS at 0.52·H whatever the scale is — same drawn width, same 0.52 aspect, bigger
    contents (the star chart is still 562px at 1080p). Multiply it and the frame goes 562 → 719px and the
    play camera's aspect 0.52 → 0.67, which is the wider desktop camera GS-play-desktop-frame's cap
    exists to prevent. The clear band pays 4.4 points (84.1% → **79.7%**, which is the band the phone
    already gets) and that is the FEATURE's cost, not the frame's — a vertical measure a wider frame
    could not buy back. Guarded by `tests/display-scale.test.ts`.
  - **THE PORTRAIT FRAME IS ONE DECISION WITH TWO CONSUMERS** (GS-startour-frame, `--gs-portrait-w`).
    The game is composed portrait and keeps a portrait frame wherever it is not phone-portrait, sized
    as a fraction of the viewport HEIGHT so the composition SCALES with the display instead of being
    pinned to a px count. The free-roam star chart escaped it: `.gs-startour` is `position:fixed;
    inset:0`, so capping its `.gs-main--bleed` parent did nothing and you came off a 600px portrait
    hole onto a **1920px** chart — a change of format mid-run that stranded the mobile-composed HUD
    (tiny buttons flung to opposite corners). `inset:0` already pins both edges, so a definite width
    + `margin-inline:auto` centres it with NO transform (which would re-parent every fixed
    descendant). The whole HUD is a CHILD of `.gs-startour`, so there is nothing else to bound. The
    **journey map needs none of this** — it is `position:relative` inside `.gs-main`, already bounded,
    and its height already scales. ⚠️ This is the MOBILE-FIRST call, taken deliberately: an expanded
    desktop chart does read better once its chrome is designed for the room, which is a bigger piece
    of work than a frame — revisit when desktop players ask. Guarded by `tests/portrait-frame.test.ts`,
    which asserts the two surfaces AGREE rather than either number.
  - **IN AN EMBED THE PAGE SCROLLS ITSELF** (GS-embed-scroll, `app/viewportFit.ts applyEmbedFlag`).
    itch.io serves HTML5 games in an iframe with **`scrolling="no"`**, so the game's DOCUMENT cannot
    scroll — a wheel over the game scrolls the STORE PAGE behind it. Reproduced: the Pro Shop is
    **1388px of content in an 860px frame and 528px was unreachable**; shipyard/clubhouse/locker the
    same. This is GS-a11y-sheet-scroll's rule (a box bigger than the viewport is unreachable content
    ⇒ cap to one screen, scroll INSIDE) never applied to the page frame, because in an ordinary tab
    the document scrolls and the bug cannot happen. `data-gs-embed` on `<html>` gates it; the
    predicate is "in an iframe", NOT "the iframe forbade scrolling" (not observable from inside, and
    a scrollable iframe works either way), and a `try/catch` treats a cross-origin throw as embedded.
    Deliberately NOT applied everywhere — a self-scrolling page stops a mobile browser's address bar
    collapsing, real screen lost in a context that was never broken. `--fit`/`--bleed` are excluded
    BY NAME (both are already one screen tall and own their overflow; the selector would otherwise
    out-specify them), and `overscroll-behavior-y: contain` stops the chain-out that made it feel
    like nothing happened. Guarded by `tests/embed-scroll.test.ts`, which drives a real
    `scrolling="no"` iframe — the only place the bug exists.
  - **THE PAGE SITS IN SPACE, AND IT IS A `body` BACKGROUND LAYER — NOT AN ELEMENT** (GS-space-sky,
    `render/spaceSky.ts`). `body` was `--gs-bg` + a faint vignette and `.gs-main` sets no background,
    so everything that is not a panel or a canvas was flat near-black. Invisible on a phone; glaring in
    FULLSCREEN, which is where a desktop player actually plays — the play frame is capped to a portrait
    strip (GS-play-desktop-frame), so it uses **29%** of the width on any 16:9 display (22% on 21:9),
    and the menus are worse at **68%** empty behind an 820px column at 2560×1440. One background, both
    fixed. A seeded seamless star tile (the SAME sky as the itch store page) is handed to CSS as
    `--gs-sky` and read as **`var(--gs-sky, none)`** — so a build where the boot call never runs lands
    on the old vignette, never on a hole. A background layer, deliberately, because a fixed ELEMENT
    would need a size (and a fixed box inside a `zoom`ed root does not measure the display —
    GS-a11y-scale-wrap), a `z-index:-1` nothing above may bury, and a mount outside `#app` to survive
    `render()`; `body`'s background propagates to the canvas and has none of those. Only the star layer
    `repeat`s — the vignette blobs are single placed washes. Wrapping is the fragile part: the link
    search is TOROIDAL and draws along the WRAPPED delta, or neighbours across an edge become a line
    ruled through the middle of the tile. Guarded by `tests/space-sky.test.ts` (determinism, the
    nine-fold wrap, max link length, a CSS-safe data URI, and that it still adds NO element).
  - **A SCREEN SITS IN THE MIDDLE OF THE ROOM** (GS-page-centre, `index.html .gs-main`). `.gs-main` is
    `min-height:var(--gs-vh)`, and every screen stacked from the TOP of that frame and left the rest black
    — fine-ish on a phone, broken on a landscape viewport. Measured at the **820×760 itch embed** (the
    default desktop embed size): the Star Tour recap left **43%** of the frame empty below the content, the
    Trade Market 47%, the champion picker 59%, a Story beat **64%**. ONE line — `align-content: safe center`
    — fixes all ~20 flow screens at once, and it must stay `align-content` on a **BLOCK** container: flex or
    grid would centre too and would ALSO stop adjacent sibling margins collapsing (the title screen's five
    sections gain ~48px) and turn every child into a flex/grid item. `safe`, never bare `center`, for the
    same reason the overlays use it — content taller than the frame starts at the top and scrolls. Screens
    that already fill the frame (full-bleed play, the viewport-locked roster, anything scrolling) have no
    free space, so it is a no-op for them BY CONSTRUCTION, not by exception; and an engine without
    block-container alignment just ignores it and keeps today's layout. Guarded by `tests/page-centre.test.ts`
    (which pins the block-container property, not only the centring).
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
  - **THE KEYBOARD ARRIVES ON THE STROKE — ZERO TABS, ON EVERY STROKE** (GS-a11y-stroke-focus,
    `focus.ts focusPlayStroke`). DOM order IS tab order, and `playFrameHTML` emitted the nav column
    SECOND, so 🗺 and ⚙ — the two least-used controls on the screen — were the first two tab stops of
    every shot: measured, **3 tabs to Swing and 5 to ⛳ Putt**, and paid AGAIN every stroke because
    `render()` replaces `#app.innerHTML` and drops focus to `<body>`. In a game that is entirely golf
    strokes, that is the whole game behind a tab dance. The nav column is emitted LAST (it is
    `position:absolute` with its own `z-index`, so its place in the string decides nothing but the tab
    order) and the panel's commit button is FOCUSED as each decision mounts — the play-screen twin of
    `applyOverlayFocus`: in once per "open", restored when a re-render knocks it loose, never fighting a
    layer with a better claim. Tab order is now `Swing · aim · » · bag · 🗺 · ⚙`, outward from the stroke.
    **The key is the DECISION** (`hole:shots:putts:lie`), so a same-stroke re-render leaves focus where
    the player put it (restored via `captureFocusOrigin`'s selector, or the aim-mode tap bounces you to
    the commit every time). **A COVERING LAYER IS THE DOM'S QUESTION, NEVER A FLAG** — the first cut
    guarded on `awaitingShotPopup`, which stays TRUE through a putt render that draws no popup (the card
    rides the AIM body's `after`; the putt frame has none), so the tee focused and the green did not; the
    shot card + scramble choice now carry `data-gs-overlay`, the marker `OVERLAY_SELECTOR` already reads.
    `preventScroll` always: the frame is fixed, and GS-embed-scroll makes the page scrollable in an iframe.
    **The pace meter is SPOKEN, NEVER TABBED** — `role="button"` earned it a tab stop AND
    `wireRoleButtonKeys`' Enter/Space→`click`, an event that canvas never listened for, so it was a dead
    stop on every putt; it is `role="img"` naming the control that does stop it (⛳ Putt, which is now the
    focused one). And `PlayFrameParts.commitHint` (required — a new play state must decide what its keys
    do) is the one `.gs-sr-only` node both live commit buttons `aria-describedby`, because the arrow keys
    live on `window`, not on a control, and the aim cone is a picture. ⚠️ The putt's ◄/► arrows were
    reported dead and are NOT — driven in a real browser at every focus position they work; the one
    silence is BY DESIGN (a caddy/gear green read renders the nudges disabled and hookless). Guarded by
    `tests/a11y-keyboard.test.ts`.
  - **CSS classes / DOM ids are GLOBAL and screens can't see each other's names** — new screen chrome gets
    its OWN prefix (bridge HUD `.gs-bhud`, resume `.gs-resume`, lore `.gs-lore`, star-tour content
    `.gs-sthud` — NEVER the play screen's `.gs-hud`, which the #353 map-blur regression proved). Grep the
    class before adding a rule; add a browser layout smoke test for new screen chrome. Between-screen views
    are reachable headless via `?screen=…` deep-links (GS-screen-deeplink, real reducer transitions).
  - **A FIGURE SCENE CONFINES ITS OWN STACKING** (GS-scene-isolate, `tests/scene-stacking.test.ts`). The
    clubhouse / lounge / spaceport / ship-interior rooms place their people and ships by the FEET and order
    them by depth, so they legitimately mint z-indices in the hundreds (lounge golfers reach ~1000, berthed
    ships ~230). Those numbers mean something only INSIDE the room: without `isolation:isolate` on the frame
    they are ordinary members of the ROOT stacking context and paint over every fixed overlay the app owns —
    the settings sheet at z-index 60, the ace/eagle/victory takeovers at 60–62. That is the reported "four
    golfers and their parked cars standing on the settings sheet". **Two things look like they already handle
    it and do NOT**: `overflow:hidden` clips GEOMETRY, never paint order; and **`container-type` is not a
    stacking context** — a query container reads exactly like a self-contained room, and the computed
    `contain` on these frames is `none`. The rule is stated for the CLASS (every container-query scene frame
    isolates), so on a scene whose figures top out at 24 it is a no-op today and still the thing that stops
    the next one being raised into the overlay layer. ⚠️ **`elementFromPoint` is the WRONG instrument for
    this** — opening an overlay seals the app with `inert` (GS-a11y-focus), and an inert subtree is dropped
    from HIT-TESTING while painting exactly where it did, so the first probe reported the sheet on top at
    every viewport while a screenshot of the same page showed the golfers across it; the guard strips `inert`
    first, which restores hit order ≡ paint order.
  - **A ROOM IS A ROOM, NOT A BACKDROP** (GS-clubhouse-floor, `tests/clubhouse-floor.test.ts`). The
    illustrated interiors (Mothership / Coil sanctum / Earth clubhouse / lounge) read as *"everything is
    velcro'd to the wall — only your character is on the floor"* for two literal reasons, both cheap to
    get wrong again: **nothing but the golfers cast onto the floor** (they carry a contact shadow; the
    furniture was drawn flat onto the wall), and **the bar counter stopped 30 units clear of the deck**,
    hanging. So: a unit that STANDS reaches the deck line (`DECK_Y`, a named constant its height derives
    from — not a hand-counted rect) with a toe kick or a plinth, and every standing unit pools a contact
    shadow on the floor; wall-mounted pieces cast a soft slab behind them for thickness. ⚠️ The guard asks
    the question of the **UNIT, not each rectangle** — a carcass sitting on a plinth correctly stops above
    the deck and it is the plinth that lands on it. `clubhouseLounge.ts` was already right (floor-standing
    furniture + contact shadows), which is exactly why it reads best; the rest of the art here is
    judgement that only eyes-on settles. **AND THE PEOPLE STAND ON IT TOO** — the furniture pass left the
    cast behind and the play-test came straight back: `FRIEND_SPOTS` sat at 67–72% against a deck at
    **74%**, so your three friends' feet were 7.4–12.4 points UP THE BACK WALL while you stood on the
    floor. A person is the one object in the room whose height the eye already knows, so it read worse
    than any furniture did. ⚠️ **A spot's number is NOT the foot position** — a standee is feet-anchored
    (`translate(-50%,-100%)`) but the NAMEPLATE hangs BELOW the feet inside the same button, ~5.5 points
    of slack, so a spot set exactly to the deck line still hovers and a test reading the spot table tests
    the wrong number: the guard drives a browser and measures the DRAWN figure. Moving them down forced
    the `left`s too (at the old height the middle friend cleared the player vertically; at deck depth they
    collided, and a friend you cannot see is one you cannot tap). Caddies were already clear (+6 to +18)
    and `EARTH_SPOTS` too — the rule is now measured for every standee in every room.
  - **Default aim** is a smart assist (GS-default-aim, `Settings.aimMode` default `'auto'`) resolved by the
    shared `aimTargetOf`/`autoAimTarget` so `previewShot`/`takeShot`/auto-finish stay byte-identical
    (contract 2); the default CLUB is `autoAimClub` in lockstep (a forced-carry drive picks
    `longestCarryClub`, not a clubbed-down wood). Interactive-only — the headless `playHole` keeps its own
    line, so determinism is untouched. The shot map ORIENTS down the resolved aim line.
  - **Surgical refreshes, not full renders** — an in-sheet toggle/aim tap swaps `.gs-settings` innerHTML +
    re-wires (`refreshSettings`, GS-settings-flicker); the settings sheet inner is split from its backdrop;
    the pull-to-power drag redraws only the overlay. A full `render()` re-mounts frames and replays slide-up
    animations as a flicker.
  - **WHICH ROSTER CARD YOU GET IS A QUESTION ABOUT THE CARD, NOT ABOUT THE PAGE** (GS-select-card-room).
    The golfer card has two dressings — COMPACT (portrait · stats · one clamped ✓/▲ hint) and FULL (blurb ·
    pros/cons · the "Tap · …" footer) — and the switch was `max-width: 999px` alone, which is a question
    about the PAGE standing in for one about the CARD: a page can be far too narrow for FOUR cards while
    being roomy for TWO. On the itch embed's default desktop viewport (820×760) the roster is 2-across, so
    each card is **390×323 — wider than the four-across desktop card at 1280×800 (277×348)** — and all four
    wore the phone dressing, reading as big cards 60% empty; a 768×1024 tablet was worse (**364×455**,
    stripped). The condition now asks about BOTH axes and asks TWICE, because the layouts differ: 4-across
    is ONE row so height never limits it (a short desktop window stays full — `TIGHT_H` is 660, so gating
    there would strip a card that fits), 2-across is TWO rows and needs a measured **760×760** floor, which
    is where the roster stops scrolling and GS-select-onescreen's promise survives. The 2-across branch also
    consults `data-gs-fit` — a media query CANNOT see `--gs-uiscale`, and the same embed at the top reader
    rung lays out in 566×524 units, which the full card overflows. Two conditions set ONE `--gs-card-*`
    switch that the four consumers read, so a fifth element can't be wired into one branch and forgotten in
    the other. Guarded by `tests/select-card-room.test.ts`.
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
    **WHICH CHART YOU ARE FLYING IS A FACT ABOUT `UiState`, NOT A FLAG ON THE VIEW** (GS-startour-chart-mode,
    `ui/starTourMode.ts isStoryChart` · `UiState.starTourFreeRoam`). ONE screen serves the free-roam records
    chase and the Story campaign navigator, and the answer decides the worlds, the ship, the HUD and where
    the SPACEPORT drops you — your campaign's clubhouse (`exitStoryMap`) or the title's cosmetic hall
    (`openClubhouseHall`). It used to be `starTourView.storyMode`, assigned in ONE place (on `openStoryMap`)
    while **SIX reducer transitions land on the chart**: `exitStoryShop`/`exitStoryShipyard`/
    `exitShipInterior` all return there, and since GS-story-venue-services the shop and shipyard open from
    the world-clear RECAP — so `storyResult → shop → back` reached the chart with no `openStoryMap` on the
    route, and a campaign docked at its own spaceport landed on the TITLE Clubhouse (`leaveAsgard` was
    worse: it cleared the flag outright). Now only the DOORS declare it — `openStarTour` arms free roam,
    `openStory`/`storyContinueCampaign`/`openStoryMap`/`toTitle` disarm it — and every other route inherits
    it through `...state`. **The default is the campaign navigator**, so a forgotten route lands on the safe
    side; safe because `openStarTour` is the only door into free roam. `state.story` can NEVER answer this
    alone — a Star Tour champion is a loaded campaign too. Transient, no save bump. Four deep-links dropped
    their hand-set copies of the flag. Guarded by `tests/startour-chart-mode.test.ts` + a register row.
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
  **There is now ONE lookup, `scripts/chromium.mjs`** (`tests/chromium.ts` re-exports it) —
  `CHROME_PATH` → Playwright caches → system Chrome/Edge/macOS — always verifying the BINARY, never a
  directory (a `chromium-*` dir can exist without one; testing the dir made `runIf` lie and hard-fail
  CI instead of skipping cleanly). It needs no env var on any normal machine: **2344 passed / 0
  skipped** locally, against the 2271/72 that used to read as green. A new browser test imports
  `chromePath` from there — **never re-derive it**, that is the second description this whole entry
  is about. It is plain ESM so the `.mjs` rigs can import it with no build step; four of them had
  been standing up a whole vite server just to `ssrLoadModule` the TypeScript one, and **a seam a
  caller must boot a build tool to reach is one the next caller copy-pastes around instead**.
  **AND THE SAME ROT HAD RUN THROUGH `scripts/` THE WHOLE TIME** (GS-preview-chromium) — 64 eyes-on
  rigs, eight different shapes, **every copy Linux-only** (`chrome-linux/chrome` under a hand-built
  cache path, no `CHROME_PATH`, no Windows, no macOS). It cost more there than in `tests/`, because a
  rig fails SOFT: it printed `no chromium, wrote /tmp/….html` and **exited 0**, so on the author's
  Windows machine every art preview this file points at as the eyes-on check silently rendered
  nothing while reporting success. `launchChromium` is the seam's answer — it tries each candidate in
  turn (existing on disk ≠ launching: the Windows Playwright download refuses to start with a
  side-by-side error on a box whose system Chrome runs fine, which is why a system browser OUTRANKS a
  cached download and why the headless shell is kept as a last resort) and **THROWS** if none start.
  A rig that cannot show you the picture has failed at its only job and must exit non-zero.
  ⚠️ The register scan bans DERIVING a path, not passing one — the browser tests hand `chromePath`
  to `chromium.launch({executablePath})`, which is calling the seam, not duplicating it.
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
- **THE `github-pages` ENVIRONMENT ALLOWS EXACTLY ONE REF, THE TAG `v*` — AND THAT LIVES OUTSIDE THE
  REPO** (GS-staging). `pages.yml`'s trigger is only half the gate: the environment carries its own
  deployment-ref policy, and it held a single `main` **branch** rule from the days when `main` WAS
  production. So the first tagged release built green and the deploy step was refused — *"Tag
  "v1.4.0" is not allowed to deploy to github-pages due to environment protection rules"* — which
  reads like a permissions bug and is actually the workflow and the environment disagreeing about
  what a release is. The `main` rule is now **deleted, not kept alongside**: while it existed a
  `workflow_dispatch` on `main` could publish STAGING code to every installed PWA, which is the exact
  thing GS-staging was built to make impossible. Nothing in git enforces this — check it before
  blaming a workflow, and re-add it if the repo or the environment is ever recreated:
  `gh api repos/OWNER/REPO/environments/github-pages/deployment-branch-policies`.
- Commit messages explain the *why*; end with the `Co-Authored-By: Claude` trailer.
- **A RELEASE IS A TAG; `main` IS STAGING** (GS-staging, `docs/decisions/process-and-deploy.md`).
  `pages.yml` used to fire on every push to `main` — and `farcarry.vulpecula.games` is the origin real
  players have **installed as a PWA**, so every merge went straight onto their phones. One day shipped
  four passes at the ball's bounce that way, two of them net-worse, each live within minutes and with no
  way to try it first. Now: **prod = GitHub Pages on a `v*` tag** (the convention `itch.yml` already
  used, tag asserted against package.json — one tag, both destinations, one version), **staging =
  Cloudflare Pages at `next.farcarry.vulpecula.games` on every push to `main`**, and **a preview URL per
  BRANCH** (`<branch>.next-far-carry.pages.dev`), which is the row that actually answers "let me try it
  before it's merged". ⚠️ **Staging must be a separate ORIGIN, never a path** — a PWA binds to its
  origin and `localStorage` is per-origin, so `/next/` would have staging and production sharing `fc_*`
  save blobs, and a staging build with a bumped schema would write one production refuses to read
  (GS-save-integrity going read-only, on a real player). Production therefore CANNOT move either: every
  installed app is pinned to that origin. ⚠️ Cloudflare's default button is the WORKERS flow (wants
  `npx wrangler deploy` + a repo config); this uses the PAGES flow (build command + output dir). ⚠️ The
  first staging deploy went **green while serving the repo root** — output dir unset, so `/src/main.ts`
  returned 200 and the game was raw dev source: the same blank-page failure Pages was set up to avoid,
  caught by its own documented signature. A green deployment is not a working one.
- **Deploy = GitHub Pages, Source MUST be "GitHub Actions"** (not "Deploy from a branch"). `pages.yml`
  builds the Vite app and serves `dist/` (a single inlined `index.html`). If Source is a branch,
  Pages serves the RAW source whose dev entry `/src/main.ts` 404s → permanent blank page. Symptom
  signature: the boot watchdog reports `…/src/main.ts` — a string a Vite *build* can never emit, so
  seeing it = raw source is being served. Keep the `index.html` boot watchdog (`tests/build.test.ts`
  guards the inlined-single-file output + the error-capture contract).
- **⚠️ "NETWORK-FIRST" IS A CLAIM ABOUT THE WORKER, NOT ABOUT THE NETWORK** (GS-sw-stale). `fetch(req)`
  inside a worker reads the browser's ordinary HTTP cache, and GitHub Pages serves index.html with
  `Cache-Control: max-age=600` — **a header Pages gives you no way to set**. So for ten minutes after any
  load the "always fetch fresh" handler answered navigations from the HTTP cache without asking the
  server, and an installed app relaunched in that window rendered the PREVIOUS build. The worker's own
  comment had promised otherwise since the file was written. **The shell is fetched `cache: 'no-cache'`**
  (a conditional request every launch; NOT `no-store`, which re-downloads the whole 2.4MB bundle on mobile
  data — `no-cache` costs a 304 when nothing changed) and the registration passes
  **`updateViaCache: 'none'`** (by default the browser asks its own cache whether sw.js changed, so a
  worker whose bytes genuinely differed still never installed). ⚠️ Diagnosed by REPRODUCING it — a
  persistent chromium profile against a server sending Pages' real headers — and the control that settled
  it was **removing the worker entirely and watching the staleness survive**. `VERSION` still moves per
  RELEASE, not per build, deliberately: between releases the fetch handler re-caches the fresh shell on
  every launch, so the version only governs sweeping old cache NAMES. Guarded by `tests/sw-update.test.ts`,
  whose second case removes the revalidation and asserts the app goes stale again — `max-age` only bites
  while the entry is fresh, so a test that merely waited would go green on the broken worker.
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

## One decision, one home — the register (GS-one-description)
The most expensive recurring bug here is ONE FACT DESCRIBED TWICE (the derelict deck ×7,
`resumableState`, the SW cache prefix, `findChromium`'s 50 silently-skipped tests, and
`isBareCampaignBlob` on the day GS-save-integrity shipped). Guards, strongest first: **compile-forced**
(a `Record<Key,…>` / a `never` fallthrough — makes drift not BUILD, always prefer it, but only covers
"one answer per member of a known set") ▸ **one seam + a source scan** banning the alternative
(`tests/one-description.test.ts` — a behavioural test proves the code works TODAY, a scan proves the
second description can't be INTRODUCED tomorrow: it catches the class, not the instance) ▸ **a test
reading both copies** (weakest; sometimes the only option, e.g. the three-file SW prefix).
**ADMISSION RULE: a row earns its place only once a fact has TWO OR MORE callers** — extracting a seam
for one caller is over-abstraction, and banning re-derivation of a fact nobody re-derives is that same
error wearing a guard's clothes. The trigger for a row is the trigger for the seam: a SECOND asker
appeared. Every row states its `cost` (a rule nobody can weigh later is a style guide) and every
exception NAMES a reason (an unexplained exception is a hole). ⚠️ **When a row cries wolf the fix is a
precise pattern or a named exception — NEVER a relaxed one**: a guard everyone has learned to edit is
worse than none (the `PRIVACY.md` rule, restated). Two self-checks keep it honest — each pattern is
proved against a SAMPLE of the re-derivation it bans (a scan matching nothing passes forever), and the
register EXCLUDES ITSELF (it names every banned shape in its own literals). The ~8 pre-existing scans
listed in its header stay where they are for now: moving a working guard can only be verified by
breaking it on purpose, and doing that to eight at once is how a register ends up weaker than the mess
it replaced.
