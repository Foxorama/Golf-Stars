# Golf Stars — working notes for Claude

A travelling space golf **RPG**. You voyage the galaxy; each stop is a procedurally-generated,
ever-wilder golf course (rarity-graded loot). Play it, earn rewards, upgrade your bag/ship/perks,
travel further as difficulty and absurdity scale. A **game**, not a tracker — its currency is
*feel, fairness, and progression*, the opposite of a realism app.

Seeded from `golf-finder` (a separate, real golf+astronomy PWA): we harvested its golf sim, rarity/
card system, hole renderer, and Flux art pipeline, then cut all real-world plumbing (GPS, OSM,
weather, real astronomy). **The two projects are independent. Do not re-couple them.**

> **This file is the constitution — the rules that constrain *new* work.** The deep per-feature
> rationale ("why GS-cetus carves the river that way") lives in `docs/decisions/*.md`, one file per
> domain. When you touch a system, skim its constitution bullet here, then open the matching archive
> doc for the full history before you change load-bearing code. **Keep this file lean** — when you
> ship a feature, the durable *invariant* goes here (a line or two); the narrative goes in the
> archive doc. Treat CLAUDE.md like IDEAS.md: scan, rerank, merge, retire — **not append-only.** If a
> bullet here has grown into a paragraph of history, move the history to the archive and leave the rule.

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
- **Course contract** (`src/sim/course/contract.ts`) is frozen: the generator emits it, the
  renderer consumes it, the sim scores it. Rewrite either side freely behind the contract.
- **Versioned saves from v1** (`src/save/schema.ts`): every persisted blob has a `version` +
  `migrate()` (one step at a time). Namespace keys `gs_*`. Export/import-to-JSON from day one
  (localStorage is the only copy). Current schema is **v12**; bump + add a migration when you persist
  a new field. Loadouts are rebuilt from perk *ids* (`loadoutFromPerks`), so most run-state changes
  need NO save bump.
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
5. **The graphic IS the physics.** `flight.ts` and `shot.ts`'s `SprayShape` are the single shared
   source the sim samples AND the renderer draws — a ball drawn clearing a tree is one the sim let
   through; the spray cone reads exactly the sampled distribution. Never fork them.
6. **Feel lives behind `window._gsFeel`** (and `_gsIntro`/`_gsSpray`/`_gsArt`) escape hatches, read
   through a `typeof window` guard so the sim stays node-pure. Prefer a `_gsFeel` *sub-field* over a
   new top-level `_gs*` flag — a new flag obligates the test-hub sync (below).

## System index — invariants + where the full story lives
For each system: the rule that constrains new work. Open the archive doc before changing it.

- **Generator & sim** (`docs/decisions/sim-generator.md`). Biomes are physics-only data rows; render
  palette is keyed by biome id in the render layer. Corridor: wide-and-wild early → tight late
  (`widthScale = 2.0 − 1.25·wildness`), built as a `ribbon` (rounded ends) off a smoothed
  template-grammar centreline; hazard placement + `validateFairness` key off the corridor's WIDEST
  point. Greens are varied STAR shapes about `green` (single-valued r(θ)) — `pinInGreen`/`rayPolyDist`/
  `validateCourse` depend on it. Pin ≠ centroid (attack aims at flag, auto/safe aim at fat-of-green).
  `lieAt` is by surface PRECEDENCE, not draw order. Dispersion is ANGULAR (rotation preserves carry)
  and sampled from an asymmetric 5-zone `SprayShape`. Forced-carry crossings (lava river / frozen
  pond / creek) are generic penalty bands; the carry-aware AI flies any of them off `penalty`, never
  the kind. OB = stroke-and-distance off the play-bounds box (which doubles as the OB trigger — don't
  shrink it casually). **Variety is DECOUPLED from difficulty (GS-variety-2):** shape archetypes
  (cape/hairpin/double) and dogleg-corner blocking GROVES appear even on CALM stops (no wildness gate)
  — difficulty rides bend severity (`dogFac = 0.5 + 0.5·wildness`) + hazard density, not which shapes
  exist. Corridors can be BROKEN into 2–3 mown segments by rough gaps (`brokenCorridor`, biome
  `roughBreaks`; skipped on lost-rough worlds where a gap = the abyss). A hole gets a forced-carry
  CROSSING **or** greenside DRAMA, never both: greenside penalty RINGS (`sanctioned:true` on Feature,
  exempt from `validateFairness`, proven by `validateGreenApproach` — kept off the approach window +
  lane) + an APPROACH LAKE ~3/4 up fill the mid/green zone that used to go quiet after driver range.
  The per-world fairway MOWING PATTERN (`fairwayStripes`) differs by archetype (horizontal / vertical
  grain / faceted-diagonal / checker) so turf reads distinct beyond colour. Difficulty bars were
  deliberately relaxed (fun over the bar; tune per-hole later) — the strict blow-up guard stays.
- **RPG meta-loop** (`docs/decisions/rpg-meta-loop.md`). The spine: `startRun → [playStop → buy* →
  travel]*` until a cut is missed; pure/deterministic. The **Voyage** is the headline winnable format
  (3 arcs, boss each, `endedReason 'won'`). **Pro Shop rarity is VOYAGE-paced**: a winnable format draws
  through `voyageRarityBias(rarity, voyageShopProgress(stopIndex,stops))` (endless formats keep the
  galaxy-distance `rarityDepthBias`), keyed off the STOP so shop 1 is mostly green+a blue, a small
  epic+legendary opens between boss 1 & 2, and the last pre-boss shop is halfish blue/halfish purple with
  a bounded legendary chance — a separate later-opening `legTilt` gates orange; commons stay flat; it
  reweights WHICH item is drawn, never the rng COUNT. **Every shop item is a one-shot** (no `stackable` in
  the catalogue) so each shop is fresh distinct gear; build depth comes from SIBLING items per axis, not
  re-buying one. The `stackable`/`itemCost`-geometric plumbing stays dormant for save back-compat (old
  duplicate perk ids still fold via `loadoutFromPerks`). Two currencies: per-run **credits** (shop perks) and
  cross-run **Star Shards** (cosmetic ships + apparel hats/shirts/pants, up to a `mythic` tier above
  legendary — `cosmetics.ts CosmeticRarity` is kept OUT of the sim's loot `Rarity`; save v8). **Cosmetics
  split buy-vs-equip** (GS-clubhouse, save v10): the **Trade Market** sells the FULL ship + apparel
  catalogues for global OWNERSHIP (`ownedShips`/`ownedApparel`; no rotating offer/reroll — scarcity is the
  shard price); the **Clubhouse** (a title-screen section, one screen per golfer) EQUIPS owned gear PER
  character (`shipByCharacter`/`hatByCharacter`/`shirtByCharacter`/`pantsByCharacter`, the last added GS-pants-outfit
  save v11), so each golfer flies its own ride + wears its own look head-to-toe. The per-golfer Clubhouse is a
  **tap-to-restyle stage** (GS-clubhouse-stage): a big full-body avatar (`golferPreviewSVG`, ONE proportional
  figure at every size — anchors are fractions of `h`, offsets scaled by `S=h/210`, arms included — so it reads as
  three tap bands here yet stays in proportion at the lounge's small `h`) whose hat/shirt/pants are three tap
  bands, over a garage-bay tile showing the parked ride — tapping any of the four reveals just that slot's owned
  rack (equip toggles / owned fleet); a "🏠 Back to Clubhouse" (`clubhouseBackToHall`) returns to the hall to
  outfit another golfer without a title round-trip. The open slot is view-only module state
  (`clubhouseSlot`, like `inspectGearId`: toggled via `[data-clubslot]`, reset on open/close, zero save/rng
  impact). The `apparel.ts` catalogue fills three slots (`ApparelSlot` hat|shirt|pants); a cosmetic **set**
  completes (`equippedSet`) only when EVERY slot it defines is worn. The Clubhouse HALL is a painted bar/fireplace **lounge** (GS-clubhouse-lounge,
  `render/clubhouseLounge.ts`): the golfers loiter in it wearing their outfits (each figure IS the button to
  outfit them, a brass nameplate at its feet for identity), placed at a seeded shuffle of fixed floor spots
  keyed off `clubhouseVisit` (a finished-run counter bumped once in `runEndUpdates`, save v12) — so they
  appear to have milled around while you were away. Purely cosmetic: seeded via `Rng` (never `Math.random`),
  zero sim/rng-stream impact. The played character's ship (journey map) + outfit (`golferLook`) resolve via
  `shipForCharacter`/`hatForCharacter`/`shirtForCharacter`/`pantsForCharacter`. Shards also
  buy permanent **default-bag tiers** (`bag.ts BAG_SETS`, GS-bag-tiers): a won Ascension gate (clear
  A2/A6/A11 → `maxAscension` ≥ 3/7/12) unlocks a rare/epic/legendary bag-and-set that re-stamps EVERY
  golfer's starting bag to that rarity (the existing Planet/Phoenix/Solar reward sets via `applyBagTier`,
  baked at `startRun`/`resumeRun` — NOT a new club, just the reward machinery applied to the default bag).
  The owned tier is a Pro-Shop FLOOR (`offerableClubs` hides clubs below it) and a no-op at `'common'`
  (byte-for-byte off). `ASCENSION_MAX = 15` so A11 is reachable. **Ascension victory club unlocks**
  (`club-unlock.ts`, GS-ascension-clubs, save v9): a NEW Ascension clear (a won voyage that pushes
  `maxAscension` higher — same gate as the bag tiers, NOT every win) permanently adds one random club to
  the *played character's* starting bag (`unlockedClubsByCharacter` stores TYPES only, re-stamped to the
  live bag rarity by `applyBagTier`; `addUnlockedClubs` is the no-op fast path when empty). Pool = the
  `CLUBS` taxonomy minus what the golfer carries/refuses + the putter; a full bag pays a rarity-scaled
  Shard consolation (15/25/45/70) instead. The reducer's exported `runEndUpdates` is the single source for
  all four run-end sites. A won voyage is celebrated by the **victory takeover** (GS-victory,
  `render/celebrations.ts showVoyageVictory`): a full-screen fanfare+fireworks overlay — a NEW tier clear
  (⇔ `lastClubUnlock` present) heroes an "A_n cleared → A_n+1 unlocked" banner — that spotlights the played
  golfer + stacks the run's rewards, then dismisses to the gameover recap. Cosmetic side-effect (mirrors the
  ace/bird takeovers, NOT in the reducer); the win no longer shares the missed-cut fall. The played golfer's
  per-character unlocked clubs (`unlockedClubsByCharacter`) are surfaced as chips on the character-select
  card. Route choice carries the destination biome + a
  difficulty/atmosphere event (economy/cut/meta only — NEVER generation rng; the physics hooks are
  `effectWindMult`, a clamped pure post-gen scale on `hole.wind` so HUD/AI/sim all read the same number,
  plus the two play-boundary twists: tradeMarket's collidable tents (GS-tents) and meteorShower's
  scorch craters (GS-meteor-scorch, `sim/scorch.ts`) — a ball resting on a crater plays the hot-but-wild
  non-penalty `scorch` lie; marks are a pure seeded function of the hole, drawn + played from the SAME source).
  The three lanes always land DISTINCT world archetypes, never the one you're on (`routeTheme` avoid-set
  via a filtered `pickThemeFrom` redraw, NOT a retry loop; split stops cross two archetypes —
  GS-journey-variety); a new course effect = a `COURSE_EFFECTS` row + a `routeEffect` mapping + a
  `weather.ts` showpiece on its OWN seeded stream. Characters/talents/
  ace rewards ride `loadout.perks` ids, rebuilt on resume (no save bump). Bosses: solo matchplay +
  Arc-II team duel (best-ball/scramble), played on a separate `:boss` rng so your ball stays a
  non-boss stop.
- **Competition & leaderboards** (`docs/decisions/competition.md`). The field is a deterministic
  STATISTICAL ghost (`ghostHoleStableford`), not N real ball-sims. Survival in the voyage is your
  POSITION in one persistent field that thins to the final two (`arcCut`/`VOYAGE_SURVIVOR_TARGETS`) —
  `competition.ts` is the single source for both the drawn board and real survival. `league.ts`
  imports `run.ts`, never the reverse (no cycle); the matchplay boss-id is resolved in the UI reducer.
- **Caddies** (`docs/decisions/caddies.md`). One named caddy at a time, rarity-weighted into the
  shop offer; the first hire blocks the rest. Each folds ONE loadout field (`driverAnywhere`/
  `chipInBoost`/`caddyGuard`/`clubSuggest`/`confidenceMod`/`lieRelief`/`puttBoost`/`autoPutt`).
  THE RULE (machine-checked by `tests/lab.test.ts`): every `NAMED_CADDY_IDS` entry must surface a
  `caddyEffects` row. Guard redirects + chip-ins add rng ONLY when armed + qualifying.
- **Putting** (`docs/decisions/putting.md`). Manual pace-meter by default (`manualPutt`); AUTO only
  via the Penelope Putter caddy (`loadout.autoPutt`) — no manual toggle. `takePutt(…, control?)`:
  control → manual, none → `onePutt` (auto/tests, byte-for-byte). Fringe-putt is interactive-only.
  `puttBoost` upgrades widen the make-band; base loadout returns `{}` so auto stays stable.
- **Render layer** (`docs/decisions/render.md`). ONE pure projector (`render/project.ts`) both
  renderers share — never reimplement the transform. ONE shared cell-shaded scene builder
  (`render/style.ts buildScene` → `Prim[]`); SVG = static map, Canvas2D = animated play view. All
  scene randomness is mulberry32 seeded from `hashHole()` (NEVER `Math.random`) on documented streams
  (`rng`/`crng`/`hrng`/decor seeds) so the SVG is byte-stable — adding a draw must not perturb the
  `rng` stream order. **The scene is also CAMERA-PROOF** (the follow-cam rebuilds it per frame):
  rng draw counts never read the projection (place in course space, consume unconditionally, cull
  at paint — never retry on `inView` or size a count off projected px) and `posHash` keys are
  course-space, never screen px — `tests/camera-stability.test.ts` guards both. **Rough is ROUGH;
  space starts at the OB frame (GS-rough-frame):** the land hull fills `playBounds`+apron with the
  world's rough palette (`LAND_SPACE_BLEND` stays small; never star-salt the turf); an ARMED
  lost-rough hole (`roughLie` biomeMod, void/cetus deep stops) instead floats a platform per play
  feature in the open deep (the void's deep = negative-energy rifts) — the render mirrors the sim's
  lost-ball gate; `tests/biome-identity.test.ts` guards it. The decision map's
  framing must hold still for the whole shot decision (frame on the pin-aim full-power spread, not
  the live drag), and the shot animation starts at the decision map's exact `decisionRadius`. Turf
  bases still emit `#3f8c3f`/`#5fd45a` (the holeView fill test). Weather/
  atmosphere is the shared screen-space `render/weather.ts`. **Per-world identity is table+dispatch,
  never a fork (GS-biome-feel):** flora (`styleFlora`), boundary markers (`OB_LOOK`), signature decor
  (`archetypeDecor`, own seeded stream per the cetus pattern), ambient air (`AMBIENT`) and wind tint
  (`WIND_RGBA`) are ALL archetype-keyed — a new world adds a row to each (`tests/biome-identity.test.ts`
  guards full coverage), and a flora variant must consume EXACTLY the classic two rng draws (extra
  variation via `posHash`, never the stream). `playView`'s `spawnLandFX` answers the touchdown per
  lie/penalty — extend it with any new penalty kind. Re-shoot the gallery
  (`node scripts/gallery.mjs`) after any `style.ts` change.
- **UI layer** (`docs/decisions/ui-intro.md`). The screen flow is a PURE reducer (`ui/game.ts`):
  `(UiState, Action) → UiState`, no DOM/time, fully unit-tested. `app.ts`/`main.ts` render state +
  dispatch; save persistence + canvas mounts + the intro cinematic are side-effects there, never in
  the reducer. Visual theme is the design-token CSS in `index.html`, not the SVG layer. The play
  screen is full-bleed (the map IS the screen) and never scrolls; the pull-to-power gesture is the
  only shot input. **`app.ts` is a 3,400-line god-file — the likeliest source of regressions; prefer
  extracting a module over growing it, and re-read the relevant span before editing.**
- **Intro cinematic** (`docs/decisions/ui-intro.md`). Cosmetic Canvas2D, not in the reducer; degrades
  safely (every frame in try/catch → `finish()`); the many-instance glow uses a cached sprite, never
  per-element `shadowBlur`. The real title boots first, the intro overlays it (keeps `build.test` green).

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

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
the NETWORK-first, subpath-scoped PWA SW above — the inverse of golf-finder's cache-first offline SW,
not a re-coupling of the two apps.)
