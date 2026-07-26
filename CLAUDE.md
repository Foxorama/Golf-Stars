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
  (localStorage is the only copy). Current schema is **v30**; bump + add a migration when you
  persist a new field. Loadouts are rebuilt from perk *ids* (`loadoutFromPerks`), so most
  run-state changes need NO save bump.
  **A backup is a BUNDLE, not a save** (GS-save-transfer, `save/backup.ts` pure · `app/saveTransfer.ts`
  the localStorage/DOM half). Progress lives in THREE blobs (`gs_save` + `gs_story` + `gs_settings`) and
  localStorage is per-ORIGIN, so the website and the Capacitor shell (`https://localhost`) cannot see
  each other's saves — export/import is the only bridge, and the only way off a device before an
  uninstall. **A new persisted blob must join the bundle or it is silently lost.** `parseBackup`
  **THROWS** (`BackupError`) on anything untrustworthy — never `importSave`'s swallow-and-return-
  `defaultSave()`, which is right for boot and catastrophic for an import (it would report success
  while wiping a real save). Import is two steps by construction: the pick PARSES + summarises, a
  second tap writes. Guarded by `tests/save-backup.test.ts` + `tests/save-transfer-browser.test.ts`.
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
  - **Switched sides is SHOWN** (GS-story-defection-clubhouse / GS-story-coil-garb). The defector's Coil
    costume (`corruptedLookOpts`) KEEPS the golfer's own shirt colour + face + hair and layers an open
    serpent robe + raised cobra hood + serpent circlet OVER it (`golferPreviewSVG`'s `coilGarb` opt), so
    they still read as themselves — a far stronger betrayal than the old flat-violet reskin (the
    `COIL_FIGURE_TINT` hue-shift is retired). Once **The Defection** interlude plays
    (`betrayerHasDefected` = `seenStoryBeats['interlude-warden']`), the Warden-path betrayer is GONE from the
    clubhouse deck AND the ship lounge (you can't talk to them anywhere) — their hat lies abandoned on the
    clubhouse floor where they stood, until you face them, corrupted, at the Ch.5 shrine. Pure render +
    predicate; zero sim rng, no save bump. Guards: `tests/story-betrayal.test.ts` + `tests/story-cast.test.ts`.

- **Putting** — `docs/decisions/putting.md`
  - Manual pace-meter by default; AUTO only via the Penelope Putter caddy (`takePutt(…, control?)`;
    none → `onePutt`, byte-for-byte). The make band shrinks with distance past `puttRange`; the drawn band
    matches. The break line stops dead at the confident read (`puttSkillOf`, cap 1.0).
  - **Backspin is OPT-IN** (GS-backspin-optin): the wedge branch of `clubRollFraction` tapers +5%→0% (a
    check-to-a-stop, never negative); a negative roll comes ONLY from a spin BUILD (Backspin Bo's
    `rollFracDelta` or `backspinBoost` gear). Pure physics change, zero extra draws.
  - **Carry / roll split** (GS-carry-rollout-split): a club's number is TOTAL (carry + run); the ball flies
    a family `carryFrac` and runs the rest, total-PRESERVING (endpoint unchanged ⇒ death-spiral neutral).
    Lives in `flight.ts` (`flightScaleFor`/`rollFractionFor`); wedge/putter `carryFrac` 1 ⇒ backspin/putting
    byte-for-byte. **The one fairness coupling: the carry-aware AI keys off FLIGHT reach**
    (`maxFlightReachOf`), never total — a forced carry must clear in the AIR. REACH decisions (green/
    position) still key off total.
  - The roll/check helper line (GS-runout-line etc.) is the full-shot twin of the putt read, interactive/
    render-only (`backspinRoll` is PURE — the mean roll through the same `rollOut`, so the drawn run IS the
    physics, contract 5). Read range is shoppable gear (`spinReadBonus`/`spinReadFull`, each paired with a
    small `backspinBoost` so auto still gains).
  - **LAND → BOUNCE → RUN-OUT is a BALLISTIC model, not an ease curve** (GS-runout-feel,
    `render/runout.ts` — pure, node-testable, render-only). The sim owns WHERE the ball finishes and the
    curved path it takes; this owns WHEN it is where and how high off the ground. The run-out splits into a
    BOUNCE phase and a ROLL phase by landing `surfaceFirmness`; within a hop the ball flies at CONSTANT
    horizontal speed and loses a slice at each CONTACT, so hop distance/duration/apex all decay off one
    restitution; the roll is constant deceleration. **The chain starts at the flight's own final ground
    speed** (measured off the same `sampleCurvedFlight`/`samplePolylineFlight` the ball was just drawn
    flying), so there is no velocity step from strike to rest. The BACKSPIN check is two beats — an airborne
    forward SKID carrying flight momentum, then the spin bites and drags the ball back, accelerating out of
    the grab and easing to rest. Three things caused the "the ball landed and then teleported away" report
    and all three are structural, not tuning: a 150ms floor tuned at MAP zoom and played at the ~6.6×
    chip/putt zoom; `easeOutCubic`, which is at max speed at t=0 and braking immediately (a real ball leaves
    its first bounce at nearly flight speed); and a `|sin|` hop train on its OWN clock, so the ball was
    airborne while braking and sliding while grounded. Knobs are `RunoutFeel` spread into `_gsFeel` — a
    SUB-FIELD, so no test-hub wiring. Guarded by `tests/runout.test.ts`; contract 5 holds (the walk is by
    ARC LENGTH along the sim's own `rollPath`, ending exactly on the resolved rest point).
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
    is **bottom-anchored with the COMMIT row last**, so commit · caddy · `»` land at the same y in every state
    while the rows above differ in height. A new play state = new row contents, never a new skeleton
    (`tests/play-hud-frame.test.ts` forbids a second `class="gs-shot gs-shot--full"`). The caddy's slot is
    PERMANENT (hired ⇒ badge · no read here ⇒ dimmed · none ⇒ reserved placeholder), so the badge — not a
    canvas corner figure — is the caddy everywhere; `playView` takes a measured `caddyAnchor` (`{muzzle,head}`)
    and skips its own figure, absent ⇒ the classic corner figure (replay screen, unchanged).
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
    inert (`0em`/`1`) ⇒ the untoggled game is byte-for-byte, and `gs_settings` merges over defaults ⇒ no save
    bump. Two rules make the zoom safe, both machine-checked: **no raw `100vh`/`100dvh`** (use `--gs-vh`/
    `--gs-dvh`, which divide by the scale — a viewport-locked box inside a zoomed root measures one screen of
    ZOOMED units and put the Swing button 185px below the fold), and **no canvas computes its own
    `devicePixelRatio`** (use `render/pixelRatio.ts canvasRatio()`, which folds the zoom in — sized off
    layout px the play view rendered at 0.69× its display resolution, i.e. blurry, on the very setting meant
    to make it legible). ONE scale lever fixes small text AND sub-44px targets together: at the top rung
    every play control clears 44px with nothing off-screen. **We ship NO dyslexia font and that is
    deliberate** — the letterform faces (OpenDyslexic/Dyslexie) repeatedly fail to beat plain Arial, and the
    one positive result resolved to SPACING, not shapes; so the toggle buys tracking/word-spacing/leading,
    kills italics and justification, and asks for legible faces already on the device. Guarded by
    `tests/accessibility.test.ts`.
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
    **click** so there is no second activation path to keep in step. A bare `:focus-visible` ring is a
    specificity FLOOR (0,1,0), so bespoke rings still win — but a rule that sets `outline:none` must restore
    one. Guarded by `tests/a11y-focus.test.ts`.
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
- **Run `npm run check` before every push — NOT just `npm test`.** `check` = `typecheck && test &&
  build`, the exact CI gate in order. `npm test` (vitest) transpiles with esbuild and does NOT
  type-check, so a green suite says nothing about `tsc` (missing required args, unused vars, wrong
  types) — that's exactly how #347 shipped "green" and failed CI at the typecheck step. A green
  vitest run ≠ type-clean ≠ builds.
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

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
the NETWORK-first, subpath-scoped PWA SW above — the inverse of golf-finder's cache-first offline SW,
not a re-coupling of the two apps.)
