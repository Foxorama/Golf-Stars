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
  (localStorage is the only copy). Current schema is **v29**; bump + add a migration when you
  persist a new field. Loadouts are rebuilt from perk *ids* (`loadoutFromPerks`), so most
  run-state changes need NO save bump.
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
For each system: the rules that constrain new work. **Open the archive doc before changing any of
these systems** — each bullet is the tip of a documented iceberg.

- **Generator & sim** — `docs/decisions/sim-generator.md`
  - Biomes are physics-only data rows; the render palette is keyed by biome id in the render layer.
  - A world can own a COURSE IDENTITY via optional `Biome` profile fields (GS-biome-profile), not just
    scalar skins: `parMix` (the composed par rhythm — desert leans par-5, jungle par-4, ice par-3),
    `shapeWeights` (per-world par-4/5 shape vocabulary, replacing the single `doglegBias` mix — desert =
    straight+cape, jungle = doglegs+doubles), `widthWeights` (per-world width-archetype pool — desert
    broad/wander, jungle chute/neck/thin). ALL OPTIONAL: the defaults reproduce the old global
    thresholds/proportions BYTE-FOR-BYTE (`cumWeights` default = the old `[.28/.41/.54/.66/.78/.89]`
    width chain; `DEFAULT_PAR_MIX` = round(n·.25)/round(n·.22)), so a world without them is unchanged
    and only an opted-in world reflows (re-run its death-spiral/fairness bars — other worlds untouched).
    A new world's FEEL is now these rows, not an engine edit. Currently set on dust-belt (long/open),
    spore-jungle (tight/twisty), ice-ring (exposed links); guarded by `tests/biome-profile.test.ts`.
    `widthWeights`/`shapeWeights` apply to par-4/5 land holes only (island/ship/par-3 pools keep their
    own recipes). `GENERATOR_VERSION` 24.
  - GS-biome-variety (in progress) — the player ask: "almost every hole/biome looks the same, difficulty
    is just length; give each world unique shapes + FILL the rough so you can't direct-line the green."
    The fix is per-world profiles on the WHOLE rotation (not just the three GS-biome-profile worlds) +
    denser off-corridor hazards, world by world (one PR each, GENERATOR_VERSION bumped): distinct
    `shapeWeights` (kill the wandering-snake read — real doglegs/capes/pinches), `widthWeights` leaning on
    the SQUEEZE archetypes (`hourglass`/`neck`/`chute`) so a pinch forces a LAYUP + iron approach
    (difficulty from strategy, not length or trick greens), and bumped `treeDensity`/`ponds`/`potBunkers`/
    scatter so the rough bites. For the SCRUBBY / TREELESS worlds a gated `Biome.roughFill` (a NON-penalty
    lie kind) scatters world-appropriate obstacles (dune-scrub `waste`, rock/shard/scrap) through the
    off-corridor rough at a density INDEPENDENT of `treeDensity`, on the `${seed}:rough:` SIDE stream so it
    perturbs ZERO main-`rng` draws (penalty crossings/greens byte-identical; only non-penalty rough ADDED)
    — the "fill the empty desert/metal/crystal rough" answer. Difficulty is deliberately raised — the
    death-spiral/tents balance fences are RELAXED with `TODO(GS-biome-variety)` (the GS-rough-gradient
    pattern), NEVER the structural fairness contracts (`validateFairness`/`Crossings`/`Course` stay green
    by construction). The `tests/fairway-width.test.ts` GRAMMAR sample moved off verdant → `asgard-realm`
    (the neutral default-weights reference we never re-profile — the `biome-profile.test.ts` byte-identity
    case moved off ember → asgard for the same reason). Done: verdant-station (strategic parkland),
    dust-belt (open dune-field desert — `roughFill` waste mounds + hourglass dune pinches), ember-world
    (tight inferno — lava-carry capes/hairpins + squeezed thin/neck corridors + charred-snag rough),
    crystal-spires (angular precision — cape/hairpin lines threaded through NECK/CHUTE corridors between
    spire forests, `treeDensity` 0.3→1.3 so the namesake spires wall the rough), tempest-reach (exposed
    wind-links — WIDE broad/wander fairways guarded by flanking storm `ponds` + pot-bunker fields, wind is
    the defence, `roughFill` fescue moor), tidal-archipelago (heroic water-carry — CAPE carries over the
    sea + lagoon-threaded hourglass/neck, `deepRough` water cut carries, palm + `roughFill` beach shore),
    toxic-mire (the Water-Serpent's swamp — the TWISTIEST world, S-curve `double`/`hairpin` coils down
    claustrophobic chute/neck/thin corridors between dead mangroves, acid pools everywhere; distinct from
    the jungle's doglegs), scrap-belt (low-grav bomber's junkyard — WIDE broad/wander bombs pocked by dense
    CRATER fields + `roughFill` scrap-plate flats + hourglass crater-pinches + barranca CAPE carries),
    ice-ring (exposed frosted links — enhanced with `roughFill` fescue on the wind-scoured shelves + more
    frozen `ponds`/pot bunkers; its green vector later RESTORED to steep in GS-green-diversity). The lost
    island/wall worlds (void/cetus/derelict) got a CAREFUL, GREENS-ONLY pass (bigger island/deck greens
    via GS-green-diversity) — no shape/width changes, because they're already the most visually distinct
    worlds (island chains / star-waterfalls / ship corridors, never a "snake") and their waterfall/wall
    machinery must not be touched (guarded green by the full walls.test/cetus.test/island-gaps suites).
    (The scrap-belt PR also UNFROZE the flagship `metal-18` static course — see the static-courses bullet —
    so no 18-hole course is a frozen exception.) ALL 15 worlds done.
  - A world can get harder via its GREENS, not just length (GS-biome-difficulty) — the optional
    `Biome.difficulty` vector (`greenTilt`/`greenComplexity`/`pinTuck` multipliers on how those ramp
    with wildness) so two worlds at the SAME depth are hard in different ways: a desert stays
    long-but-smooth (no `difficulty`), an ice/ember/crystal world's greens turn treacherous deep in.
    All ride the existing GREEN SIDE STREAMS (`:slope:`/`:contour:`/`:pin:`) and every lever CLAMPS so
    the defaults reproduce the old draws byte-for-byte (terrain + non-opted worlds unchanged); bounded
    so it's harder-never-unfair (slope/lobe stay under `greenSlopeMax`, the pin stays inside the green).
    This is the GREEN axis only; firmness / forced-carry axes (main physics stream) are a later pass.
    Guarded by `tests/biome-difficulty.test.ts`. `GENERATOR_VERSION` 25.
  - GREEN DIVERSITY (GS-green-diversity) — the player ask: "small greens are too EASY to putt (if you hit
    one you're near the pin); bigger, more varied greens are HARDER (you can be on the green but 60 ft away
    across a ridge) — do a lot more green diversity for difficulty + uniqueness." So every rotation world
    got a DISTINCT, mostly BIGGER green identity via the existing scalar levers: `greenSize` (the poster
    lever — desert/earth HUGE smooth 1.5, most worlds 1.1–1.25, up from 0.85–1.0), `greenAspect` (long
    shelves — ice 2.6, tempest 2.3), `greenIrregular` (kept per-world for silhouette variety — jagged ember
    1.45, smooth desert 0.85), `greenSlopeMax` (steeper), and a `difficulty` vector on nearly every world
    (ice restored to the steepest 1.35/1.35/0.55; the DESERT deliberately keeps NO vector — its putting
    test is pure SIZE on a big SMOOTH green, and it's also the biome-difficulty test's smooth reference).
    CRITICAL — cheap by construction: `greenSize`/`greenAspect` are a post-multiply / fixed-draw PARAM (not
    an rng-count change) and slope/contour/pin ride the per-hole SIDE streams, so this pass reflows ZERO
    main-terrain draws (crossings/shapes/widths byte-identical) — only `greenIrregular` would perturb the
    stream, so it was LEFT per-world. Bigger greens are EASIER to hit (so the auto death-spiral bars don't
    trip — the auto sim's putting is simplified) but HARDER to putt for a human (longer lag, more break) —
    the intended asymmetry. Only the ace-ship fixture seed re-pinned (79 → 25). `GENERATOR_VERSION` 36.
    The careful trio followed (`GENERATOR_VERSION` 37): void (bigger, steeper asteroid greens), cetus
    (bigger rolling tide-pool greens — waterfall/island machinery UNTOUCHED), derelict (bigger canted
    deck pads — walls/ship-corridor/containment UNTOUCHED); green levers ONLY, so the full walls.test /
    cetus.test / island-gaps suites stay green. Every rotation world now has a distinct green identity.
  - A multi-hole stop is COMPOSED, not IID-sampled (GS-compose, `course/compose.ts planCourse`): the
    run path (`runCourse`, `opts.compose`) plans a par SEQUENCE (proportions track the generator's own
    ~25/55/20 mix, a par-3+par-5 guaranteed, never 3 identical pars in a row), 1–2 SIGNATURE holes (a
    heroic drivable par-4, a stout long hole — skipped on lost/ship worlds), adjacent-SHAPE contrast
    (a hole rotates off its predecessor's family, zero extra draws), and a MEAN-PRESERVING difficulty
    ARC (per-hole wildness opens gentle → builds to the finish with a seeded breather/spike jitter; the
    offsets sum to ~0 so the stop's average wildness = the course wildness the death-spiral bar is tuned
    to). OPT-IN: `compose` absent ⇒ byte-for-byte the old IID generator (the planner is never called), so
    every DIRECT `generateCourse` test/slice is unchanged — only the run path + `tests/compose.test.ts`
    opt in. Balance guarded by a composed death-spiral bar (`tests/compose.test.ts`, same fences as the
    IID bar); it's an internal generator opt, NOT a `_gs*`/URL hook, so no test-hub wiring.
    `GENERATOR_VERSION` 23.
  - A composed course can PIN its exact par routing (GS-hole-plan, `GenerateOptions.parSequence` →
    `planCourse`): an authored hole-by-hole par list REPLACES the random par multiset + contrast
    ordering entirely (hole `i` = `parSequence[i % len]`; shorter tiles, longer truncates), so a
    real-course replica carries its actual rhythm instead of a distribution sample. Wins over
    `parCap`/`parMix`; when set the par-planning rng draws are skipped (authored, not rolled). OPT-IN +
    only ever passed by a pinned static course ⇒ absent is byte-for-byte the old random par plan, no
    stream perturbed (contract 1), no test-hub wiring. Built for the Old St Andrews course (below).
  - A world's APPEARANCE RATE is its themes' summed rarity weight per arc; a world with themes in
    only one arc (or only epic-weight ones) is near-unreachable in the deep game where a run spends
    most of its stops. Every archetype must carry ≥1 arc-3 theme at ~toxic-mire (swamp) weight or a
    long voyage can skip it entirely (GS-biome-frequency: cetus/derelict/metal each got one COMMON,
    arc-3-pinned deep-sky destination — the frequency lever is rarity WEIGHT, not a loot statement).
    Lifting a world = a new theme ROW (+ a `gen-sky-coords.mjs` J2000 anchor for the journey map),
    never an engine edit.
  - Corridor: wide-and-wild early → tight late, a `ribbon` off a smoothed template-grammar
    centreline; hazard placement + `validateFairness` key off the corridor's WIDEST point.
    WIDTH is a per-hole ARCHETYPE (`chooseWidthProfile`: classic/chute/neck/hourglass/wander/
    thin/broad → `Hole.widthId`), variety-not-difficulty like the shape grammar. Lost-rough
    holes draw a WIDEN-ONLY island pool (island/-bays/-flare/-broadtee/-broad): width is
    survival there, so every island `at(u) ≥ 1` (machine-checked) — islands only get wider,
    never squeezed. Squeezed profiles floor at their own `floorFrac` (abs 5-yd half-width
    min). Re-shoot `scripts/width-preview.mjs` after touching it. The auto AI READS this width
    (GS-fairway-width-2, `widthLayupTarget`/`corridorHalfWidthAt` in `round.ts`): a positioning
    drive that would come down in a GENUINELY TIGHT driving-zone pinch lays up to the wider bay
    just short (position over power, auto ≡ interactive — it lives in the shared `safeTarget`).
    Gated LOW (`pinchHalfWidth` 10) so it fires only on the brutal deep-stop corridors — RAISES
    mean per-stop Stableford (contract 4), never fires on wide calm corridors. Pure, zero rng.
  - The reach-AI plays POSITIONAL golf out of trouble (GS-rough-gradient-rebalance, `round.ts`): the
    twin sparse-bag death-spiral drivers were (a) a TREES lie — the AI aimed at the green through the
    forest (`clearLine` only sees penalty hazards, not trees), re-hit trees, and blew up (~60% of
    pick-ups carried a trees lie), and (b) a SHORT-game stall — the sim only ever swung FULL, so a chip
    onto a green / a punch-out flew the target into trouble. Two pure, zero-rng fixes in the SHARED
    `layupTarget`/exec path (so auto ≡ interactive, contract 2, byte-checked): `recoveryTarget` punches
    OUT of trees/deep-rough to the nearest REACHABLE fairway (penalty-free line, never over a hazard)
    when the green's out of reach; `autoShotPower` dials the power DOWN for a genuine short shot (shortest
    club + target inside `AUTO_THROTTLE_MAX` of its carry, never a forced carry) so a chip/punch lands
    near the target instead of past it. Both fire only in the chip/punch regime, so ordinary reach shots
    are BYTE-IDENTICAL (the whole suite is the guard). Pulled the worst sparse-bag max-wildness bar
    ~1.27→~1.07 toPar and ~20%→~12% floor-hits WITHOUT softening the rough (density unchanged); the
    `tests/characters.test.ts` fences tightened 1.45/0.25 → 1.15/0.15 to match. The residual gap (a
    sparse bag still misses more greens) is a short-game/scoring pass, never softer rough.
  - Greens are varied STAR shapes about `green` (single-valued r(θ)) — `pinInGreen`/`rayPolyDist`/
    `validateCourse` depend on it. Pin ≠ centroid (attack aims at flag; auto/safe at fat-of-green).
  - The green-END varies per hole (GS-green-end): the fairway APRON used to be ONE fixed tapering wrap on
    EVERY hole (the "tapered snake head" — every hole-end read identical). Now a per-hole green-COMPLEX
    archetype varies the apron shape BEHIND + AROUND the green (the part the corridor, which ends AT the
    green, doesn't reach — so it genuinely reads): a perched SHELF (no tail, rough behind — going long is
    punished), a gathering PUNCHBOWL (wide wrap + stub tail), a long RUNOFF collection ramp, a narrow
    TONGUE promontory, or the classic OPEN wedge. Drawn from a DEDICATED side stream
    (`${seed}:greencomplex:`, the pin/slope pattern), so it perturbs ZERO main-`rng` draws — terrain,
    hazards, pin, slope, greenside guards all byte-identical; only the apron polygon shifts (the SHELF's
    rough-behind is a mild scoring change, not a stream one). Skipped on lost-rough worlds (floating
    island greens have no apron). `GENERATOR_VERSION` 39. Sibling of GS-approach-hazards in the
    hazard/hole-END distribution follow-up to GS-biome-variety.
  - `lieAt` is by surface PRECEDENCE, not draw order. Dispersion is ANGULAR (rotation preserves
    carry), sampled from an asymmetric 5-zone `SprayShape`.
  - Forced-carry crossings are generic penalty bands; the carry-aware AI flies them off `penalty`,
    never the kind. Rivers hold the full carry width across the corridor but taper + terminate
    believably off it (GS-rivers); crossing character/position vary and are fair BY CONSTRUCTION —
    `riverChannel` clamps the crossing into the fair window, `generateCourse` throws, no retry.
  - Hazards never overlap CROSS-family (`dedupeHazardOverlaps`, zero-rng post-filter; trees exempt,
    crossings always win); SAME-family overlaps are legal and render union-merged.
  - An ARMED lost-rough island hole strips every void-stranded hazard (`clearVoidHazards` — the
    abyss is the only penalty there); void/cetus deep par 4/5 are ISLAND-HOP pad chains whose gaps
    are completable by construction (`separateIslandGaps` + `validateIslandHops`). Void/cetus AND the
    **derelict-ship** (GS-derelict — a dead starship: off the mown hull DECK is open space, par 4/5 break
    into a chain of hull SECTIONS split by star-gaps you carry) are all in `BALANCE_EXEMPT_BIOMES`
    (deliberately brutal, skipped by the death-spiral harnesses). The derelict reuses the proven island
    machinery: a `shiprough` lie ("Lost to space") whose penalty IS `voidlost` (the +1 non-replay drop),
    `SHIP_CLIFF` metal undersides, a `derelict` archetype (deep-sky themes Ghost/Skull Nebula, no
    champion/figure). Unlike void/cetus (which arm lost-rough only at `wildness ≥ LOST_ROUGH_MIN_WILDNESS`
    0.55, playing as FAIR rough when calm), the derelict is walled SPACE at EVERY wildness
    (GS-ship-calm-space, `lostRoughMinWild = biome.walls ? 0 : 0.55`): off the deck is ALWAYS `shiprough`,
    even on a calm stop, so the bulkheads always have space to bounce a ball back from — a calm derelict is
    a tighter walled corridor, never a parkland-with-rough where a ball sails "over" a decorative wall into
    fair rough. Gated on `biome.walls` (derelict-only), so void/cetus stay byte-for-byte. `GENERATOR_VERSION` 26.
  - SHIP CORRIDORS (GS-ship-corridor): the derelict does NOT play the void's wide, blobby survival
    islands — it plays STRAIGHT, CONSTANT-WIDTH metal HALLWAYS you shoot DOWN. Gated on `biome.walls`
    (`const ship`, the derelict is the only walls world → every other world byte-identical): (a)
    `SHIP_CORRIDOR_SCALE` (1.6, fixed — no wildness ramp, no VOID_ISLAND_SCALE) sets the hallway
    half-width (widened from 1.25 so wall bounces cost less distance + you can cut corners, and the
    corridor SHOULDER has room for breach hazards — GS-ship-interior); (b) `chooseWidthProfile`'s `ship` branch returns a `'ship-corridor'` UNIFORM profile
    (`floorFrac` 1, near-symmetric — no landing bays, no widen-only bulges); (c) `buildCentreline`'s
    `sp()` resamples at ONE point/segment for the ship (`sharp` → 2 elsewhere), so runs are DEAD STRAIGHT
    and turns are HARD ANGULAR junctions, and the island 1.4× bend swing is skipped. The hull-SECTION
    star-gaps (lost par 4/5) remain — a chain of straight corridor pieces across breached hull. The
    walled corridor + impassable bulkheads mean a sideways miss ricochets back, never lost, so the tight
    hallway stays fair. `GENERATOR_VERSION` 21.
  - SHIP FEEL (GS-ship-feel): three pure-geometry, zero-rng touches that sell "a ship coming apart adrift".
    (1) SHARP CORNERS — `biome.sharpCorners` drops `buildCentreline`'s Catmull-Rom sampling to 2/segment
    (`sp()`), so the corridor bends at ANGULAR ship-hallway corners not smooth arcs; SAME control points/rng
    (every other world byte-identical), mild enough the ribbon never folds (1200-seed fairness sweep clean).
    (2) TORN EDGES — `styleTornHull` bristles twisted-metal shard teeth along each lost hull-SECTION outline
    (course-length-spaced count → camera-proof), so a severed piece reads ripped, not clean-cut. (3) DRIFTING
    JUNK — `render/shipDrift.ts` (the cetusFlow twin: play-view only, rides the SHARED WALL clock +
    `_gsFeel.shipDriftSpeed`, SVG map byte-identical) tumbles torn hull-plates through the open space
    around the wreck; all its pieces are course-anchored (GS-decor-view-states).
  - SHIP DECK LOOK (GS-ship-deck): the derelict is DRESSED as a ship interior, all pure geometry + zero
    rng (posHash/course-length counts → camera-proof), gated to the `derelict` archetype so every other
    world is byte-identical. (1) DECK PLATING — `style/ship.ts styleShipDeck` reads the corridor
    LENGTHWISE as a hallway floor you travel DOWN (a lit central WALKWAY spine with painted guide edges +
    chevrons, wall-hugging edge SHADOW so it reads concave/sunk, conduit trays down each wall, an
    OFFSET-BRICK plate grid whose staggered joints read as deck panels — NOT the old uniform transverse
    rungs that looked like a tank track — access hatches + scuffs/scorch), built in course space off
    `hole.centreline` and clipped to the corridor polys. (2) HULL SECTIONS — `style/platforms.ts
    styleShipHull` REPLACES the void's geological `platformCliffs` strata under the derelict's lost pads
    with a SHIP-HULL cross-section (dark riveted hull wall + horizontal interior-deck lines + vertical
    structural frames + a lit steel deck-rim + a ragged torn bottom), so a floating section reads as a
    chunk of wrecked STARSHIP, not a rock island. (3) BULKHEADS — `style/walls.ts styleShipWalls` draws
    the corridor walls with real presence (inward deck shadow so the corridor reads sunk, dark-steel body,
    lit cap, buttress ribs, rivets). A new derelict painter = a new `style/` module or the platforms
    domain; never import style.ts.
  - SHIP INTERIOR (GS-ship-interior, `style/ship.ts`): the derelict is the inside of a large wreck you play
    golf IN (a really-big ship, not shrunken players), so three more painters — pure geometry, zero rng,
    camera-proof (course-space counts + posHash), gated to `derelict` → every other world byte-identical.
    (1) `styleShipInterior` dresses the grey platform BESIDE the corridor as the ship's guts: an interior
    deck-plate band flanking the hallway with bulkhead RIBS (doorway gaps), conduit runs, adjacent
    ROOMS/compartments (sunk floors, consoles, lamps) + lower-level GRATING glimpses — clipped to the
    platform, so a room past the hull tear is sliced open in cross-section. (2) `styleShipBreaches`
    draws the derelict's `breach` HAZARDS (union-merged via `derelictBreachesFor`) as ACID-ETCHED HOLES
    eaten through the deck to space (acid-green corrosion + a caustic etch rim + the cut deck thickness +
    a star-lit void interior); the bright acid ring reads them apart from the plain-black OB. CRITICAL:
    `breach` is EXCLUDED from `style.ts`'s generic `scatterHaz` bucket — left in, `styleScatter` ALSO
    painted each breach with the unknown-surface fallback fill (`fillFor` → purple `#6a4f8a`), a PURPLE
    blob over the acid hole (the "acid void holes render as purple zones" bug); `styleShipBreaches` is now
    the ONLY breach painter. (3) the
    derelict's `waste`/`sand` SCATTER FEATURE draws as an intact riveted steel DECK PLATE (`styleShipPlates`
    in the feature loop) — a firm lie, never the default tan beach-sand patch. So the ship has NO bunkers.
    (4) JAGGED PLATFORMS — `jagShipPlatforms` rips the smooth rounded pill of each LOST hull section into a
    SHARP torn silhouette (densify + posHash outward-biased teeth, capped so the poly stays simple for the
    clip), used for the fill, hull cross-section, torn teeth AND the interior clip; `styleShipHull` follows
    the JAGGED front edge (not a convex hull), tears its bottom hard, and cuts open EXPOSED lower-deck
    compartments (dark voids to vacuum). Gated to LOST holes (a calm stop is one continuous deck).
  - BREACHES ARE A PENALTY (GS-ship-interior, sim): the derelict's only on-corridor hazard is the acid
    `breach` lie — a lost-ball penalty (`voidlost`, the +1 non-replay drop, reusing shiprough's mechanic).
    The walled corridor otherwise loses no balls, so breaches force care. Placed in a dedicated ship block
    in the corridor SHOULDER — OUT past the central fair lane (`half*0.5`) but INSIDE the bulkheads, so a
    sensible centred shot is clean yet a drift toward a wall falls through; every breach is proven clear of
    the central lane before it's kept (a strict mirror of `validateFairness`), so `generateCourse` never
    throws. `greensideKind: 'breach'` rings calm greens via the SANCTIONED greenside ring (gated `!ship ||
    !lostRough` so a lost island-green never floats breaches in space); `fairwayBunkers: 0` (no sand).
    Ship-only + gated → every other world byte-identical. `GENERATOR_VERSION` 22.
  - DRIFTING WRECK PIECES (GS-ship-wreck, `render/shipWreck.ts` + `render/shipDrift.ts`): SMALL, detailed,
    weathered chunks of the ship "STARLIT WANDERER" drift through the space beside the corridor — a BRIDGE
    (window grids, nav lights, dying ember, the ship NAME sprayed + WEATHERED + CLIPPED to the hull, not a
    flat decal), a solar WING, an ENGINE cluster. Canvas2D play-view only (the animated twin of the static
    map debris). The big hull SECTIONS are WORLD-ANCHORED (GS-decor-view-states, `shipDriftModel`): a
    course-space base + a course-yd/s drift + a course-YARD size, projected each frame exactly like the
    small tumbling chunks and the static SVG twin — NOT the old screen-fraction anchor (`fx*W`,
    `sizeFrac*min(W,H)`) that held a fixed on-screen size but decoupled from the world, so it rendered a
    DIFFERENT scale + drift path in every view state and JUMPED on the aim→watch switch. They now zoom with
    the world (bigger in the tight follow-cam, smaller in the whole-hole map). CRITICAL: `drawWreck`'s piece
    frame is `ctx.scale(S)`, so every stroke width is a PIXEL value ÷ S (a raw lineWidth balloons into a
    giant blurred halo). Zero rng, map byte-identical.
  - SHIP-CORRIDOR WALLS (GS-ship-walls, `sim/walls.ts`): the derelict's corridor is lined by collidable
    METAL BULKHEADS (stamped on `hole.walls` by the generator from the SAME ribbon edges it draws, gated on
    `biome.walls` → zero rng, every other world byte-identical, skipped on island-green par 3s). They stand
    `WALL_HEIGHT` = 72 yd — ABOVE the 60-yd shot-apex cap (`ARC_FEEL.peakMax`) — so NOTHING clears them: every
    ball that leaves the deck sideways RICOCHETS back onto the corridor. Resolved in the shared `executeShot`
    right after the tent branch (auto ≡ interactive).
  - SHIP PINBALL FLIGHT (GS-ship-pinball-flight, `round.ts shipFlightPath`): the derelict does NOT fly the
    parkland fade/hook BANANA — a corridor ball flies a STRAIGHT line and CRACKS off each bulkhead, caroming
    down the metal hallway to its airborne landing (a spaceship corridor, not a gentle curve — the whole feel
    of the world). The sim marches the straight shot line, reflecting off the DRAWN DECK edge at the first
    SOLID-station departure (`firstSolidDeparture` + `inwardReflect`, which forces a `WALL_MIN_INWARD` turn so
    a grazing hit can't machine-gun a bounce loop), then CONTINUES the flight along the reflected line up to
    `maxBounces` — the full carry is spent along the reflected polyline (a bounce-cap hit LANDS at the last
    on-deck ricochet, never extends into space). A forward torn-hull star-gap is a NON-solid station, so a
    sanctioned carry flies clean. The exact reflected polyline is stored on `ShotLog.flightPath`; the renderer
    draws THOSE straight segments (`samplePolylineFlight`), so the graphic IS the physics (contract 5). ALWAYS
    taken on a walled hole so even a clean drive is straight, never a banana; a 0-bounce ship shot keeps its
    exact old landing + roll energy (byte-identical outcome, render-only straight path), a bounced one carries
    on down the deck with a lively metal floor. Pure geometry, ZERO rng, derelict-only (`hole.walls` gate → every
    other world byte-identical), and it only ever keeps a would-be-lost ball IN the corridor (Stableford can only
    rise — contract 4; plain corridors keep ~99% of drives in, gapped island-hop holes still punish a blind
    driver into a carry-gap). This SUPERSEDED the old banana-walk `flightWallBounce` (removed); `wallFlightHit`
    now feeds ONLY the aim cone (below). ON THE GROUND it's a PINBALL (GS-ship-pinball): a rolling ball REFLECTS off a wall
    (`wallRollBounce` + `wallReflect`) and keeps rolling — wall to wall — until friction + a per-bounce
    metal loss (`WALL_ROLL_RESTITUTION` 0.82) bleed the momentum away, NEVER the old dead stop. A walled
    hole routes through `rollOut`'s position-tracking integrator (the curling one, kick/bend gated to
    genuinely-contoured greens so a plane green stays byte-identical to the straight walk); non-walled
    holes take the straight/curling paths byte-for-byte. Walls also BLOCK THE AIM CONE like a treeline
    (`sprayBlocking` `walls` opt → a 🧱 glyph on the shaded slice) so a bounce is never a surprise. Walls
    break at the island gaps (open hull) so a star-carry stays open, and only ever SAVE a ball that would
    be lost to space (they raise Stableford — contract 4 by construction). Drawn by `style/walls.ts`
    (`styleShipWalls`, camera-proof rivet counts) off the same `hole.walls`; a bounce clangs the world's
    struck-metal voice + throws sparks (`onWallBounce` → `sfx.land(..,treeHit)`). `ShipWall` lives in the
    course contract. WALL GRAPHIC = BOUNCE LINE (GS-ship-wall-bounce): on a LOST hole the ball bounces at the
    fairway-corridor edge (`hole.walls`), but the DRAWN hull deck is `dilateUnion(fairway,+14)` — ~14 yd of
    dead space you can never land on (`lieAt`→`shiprough`) lies past the bounce line, and its bright torn-hull
    rim was misread as the boundary. So on a lost hole `styleShipWalls(…, bold=true)` draws an UNMISTAKABLE
    bulkhead — a thick lit crest tracing the exact bounce line + an OUTWARD cast shadow sinking the dead-hull
    margin behind it — and `SHIP_CLIFF.lip*` is dimmed so the outer torn rim no longer out-shines it. Render-
    only, derelict-LOST-only (calm derelict holes, where off-corridor is fair rough and walls don't bounce,
    keep the subtle partition look byte-identical; every other world unaffected), zero rng, camera-proof.
  - SHIP-CORRIDOR CONTAINMENT (GS-ship-corridor-contain, `round.ts`): the promise "a sideways miss ricochets
    back, NEVER lost to space" is guaranteed BY CONSTRUCTION, not by the per-segment collision. The pre-built
    wall SEGMENTS are two parallel rails per corridor section — they do NOT close a fence around a deck that
    ZIGZAGS with hard-angular corners, so a flight + the pinball roll reach off-hull spots
    through the corner OPENINGS between adjacent rails and past the chain ends (measured before the fix: ~25%
    of full-power derelict drives lost to space DESPITE the walls, most resting a few yards off the edge — the
    root of five failed "fix the walls" attempts). THE FIX: the DECK the renderer draws IS the real bulkhead
    (graphic ≡ physics). `executeShot` runs two deck-boundary layers on walled holes: (a) `shipFlightPath`
    (GS-ship-pinball-flight) — march the STRAIGHT shot line and ricochet off the DECK edge at each SOLID-station
    departure (a real mid-air carom, continues down the corridor, sparks), the straight-pinball flight that
    replaced the leaky per-segment `wallFlightHit` AND the old banana-walk `flightWallBounce`; it catches every
    sideways escape (100% of first-departure leaks gone; plain corridors keep ~99% of drives in); (b) a rest BACKSTOP (`containToDeck`) — any ball still off the
    hull at a solid station (a rare post-gap-transition drift) is pulled to the nearest deck, appended to the
    run-out path so it visibly rolls back. "SOLID station" = the centreline point
    nearest the ball is itself ON the deck; a rest whose station centreline is off-deck is a sanctioned
    torn-hull GAP (a forward carry) and stays lost, and a `breach` rest is a deliberate hazard (excluded via
    `isLostToSpace`). The margin-seat is RE-VALIDATED so it never lands in a thin space sliver between a `waste`
    plate and the fairway. BUT the boundary is a DRAWN bulkhead you can SEE (GS-ship-space-boundary): both the
    flight ricochet (`firstSolidDeparture`) and the rest backstop (`containToDeck`) are gated on a real wall
    within `CONTAIN_MAX_WALL_DIST` (22 yd) of the departure/rest point. A near-edge miss (a few yards off a
    solid stretch, covering the +14 yd drawn dead-hull dilation and the hard-corner NOTCHES) is still caught;
    but a ball flung FAR out into open space — beyond every bulkhead, through a torn-hull gap OPENING or clean
    past the wall ends — has nothing to bounce off, so it flies FREE (stays lost) rather than caroming off
    nothing / being reeled onto the fairway by an invisible "far space boundary" (the bug: derelict drives were
    reaching 40–175 yd off the nearest wall out in the void, then boomeranging back). "Contained" means a
    bulkhead is THERE; open space is a real loss. Pure geometry, ZERO rng, derelict-only (`hole.walls` gate →
    every other world byte-identical), and containment still only ever moves a ball ONTO the deck. The
    LESSON for any future "walled / contained" world: a pre-built segment fence can't contain a ball on a
    bending, breaking corridor — make the DRAWN PLAYABLE SURFACE the physics boundary (in flight AND at rest),
    never a segment crossing — but only where a bulkhead actually EXISTS; past the walls the ball is genuinely
    lost. Regression: end-to-end seeded drives in `tests/walls.test.ts` assert (1) no resting ball off a SOLID
    walled stretch is still `containToDeck`-able, (2) a ball flung far past the bulkheads flies free (no reel-
    back), and (3) no flight bounce-vertex sits far from a drawn wall (no ricochet off empty space).
  - Variety is DECOUPLED from difficulty: shape archetypes + dogleg corner groves appear on CALM
    stops; difficulty rides bend severity + hazard density, not which shapes exist. And a hard hole
    need NOT bend (GS-variety-3): `straightP` RISES with wildness (deep stops GAIN straight holes,
    defended by length/width/rough/green tilt) so a wild stop stops reading as all-severe-bends — the
    worst-hit worlds were the long low-gravity ones (void/cetus/Rainbow Road). DRIVABLE par-4s persist
    at every wildness (a heroic change-of-pace, no longer halved deep in). Lost-rough par 4/5 draw an
    island STORY (`runway`/`island-green`/`cape`/`stepping-stones`/`staggered`) so the pad chain varies
    in count + position, not one even chain; every gap is floored to `ISLAND_GAP_MIN_YD` (past the
    render's dilation bridge) so a void carry always READS as a real gap (graphic ≡ physics), still
    clamped completable (`separateIslandGaps`/`validateIslandHops`). `GENERATOR_VERSION` 20.
  - GS-variety-4 EXTENDS variety-3 to the PROFILED worlds (the player ask: a high-Ascension DESERT stop
    read as an unbroken run of long, boring, bending "snakes"). Variety-3's `straightP`-rises-with-wildness
    only fired on the FALLBACK (no-`shapeWeights`) picker, so every `shapeWeights` world (desert/scrap/ice/
    jungle/…) stayed maximally bendy deep in. Now `pickWeightedShape(roll, weights, wildness)` lifts the
    STRAIGHT share past `SHAPE_STRAIGHT_RAMP_MIN` (0.55) by `SHAPE_STRAIGHT_RAMP_K·(wildness−min)` and
    renormalises — so a wild stop mixes in change-of-pace straight breathers (bend share ~84%→~75% on the
    desert at w=1) instead of all-bends. Byte-identical BELOW the threshold (boost 0 ⇒ every calm/mid seeded
    test unchanged) and consumes ZERO extra rng (remaps the already-drawn `shapeRoll`, contract 1); deep-stop
    output re-flows so `GENERATOR_VERSION` is bumped. The DESERT also got a touch WIDER + more generous
    (`fairwayWidthMult` 1.1→1.25, `widthWeights` leaned onto broad/classic) to make higher difficulty FUN not
    tight — but KEEPS its hourglass pinch (0.16) and the corner-cut deep-rough reject margin was tightened
    (+22→+18) so the wider fairways don't flatten the surviving bends into free curves (cutting a corner
    still lands in hay). Difficulty from strategy + length + wind + big greens, never a monotonous snake.
    Guarded by the composed + IID death-spiral bars (huge headroom: all-worlds toPar ~0.62 at w=1) and the
    biome-profile contrasts. `GENERATOR_VERSION` 41.
  - DEEP ROUGH chokes a dogleg's cut-the-corner chord (biome opt-in `deepRough`; ocean uses water);
    fair by construction (far from the bent corridor), wildness-gated, zero-rng on straight holes.
  - ROUGH GRADIENT (GS-rough-gradient): a distance-graded fill LINES every non-lost hole so a spray
    can't ignore the hole — HEAVY rough (deeprough/fescue) HUGS the fairway edge, TREES thicken with
    distance ("further out = more forest"). Calm stops = a WIDE recoverable buffer, trees far out;
    wild stops (≥ `ROUGH_CHAR_MIN_WILDNESS` 0.45) roll a per-hole CHARACTER (tight tree chute /
    heavy-rough gauntlet / mixed) so they read "a lot more random". All NON-penalty (fairness ignores
    them); a `standoff` keeps every blob OFF the mown centreline route. Ocean keeps `fescue`-only (its
    heavy rough is dune, its deep-rough-cut is the SEA). CRITICAL: drawn from a DEDICATED side stream
    (`${seed}:rough:${holeIndex}`, like the pin/slope), so it perturbs ZERO main-`rng` draws — every
    penalty crossing/green/grove + `validateCrossings`/`validateFairness` stay byte-identical; only
    the non-penalty rough is ADDED. Balance was DELIBERATELY not re-tuned (rough first, rebalance
    next): the death-spiral fences are relaxed to the interim reality with `TODO(GS-rough-gradient)`
    — re-tighten them in the rebalance, never by softening the rough.
  - A hole gets a forced-carry crossing **or** greenside drama (sanctioned penalty rings +
    approach lake), never both. Corridors can break into mown segments (`brokenCorridor`, biome
    `roughBreaks`; skipped on lost-rough worlds).
  - APPROACH DEFENCE (GS-approach-hazards): every earlier hazard pass clusters on the LANDING zone
    (`t ≈ 0.28–0.75`), so the last third + the FRONT of the green were nearly hazard-free and a long
    approach was a free swing ("hazards are incredibly tee-heavy; very few in front of the green"). A
    dedicated pass now guards the run-in on par 4/5 non-lost worlds: a FRONT bunker short of the green
    (ray-marched to the real front edge, slid to a side so a tucked back pin sits behind it — "carry the
    front bunker to the back pin") + 1–2 cross-bunkers pinching the last third (`t 0.72–0.9`). Sand/pot
    class → NON-penalty (a stance tax, never a lost card) so they may bite the approach line and
    `validateFairness` ignores them. Drawn from a DEDICATED side stream (`${seed}:approach:`, the
    rough-gradient pattern) → perturbs ZERO main-`rng` draws (penalty crossings/ponds/greens + every later
    hole byte-identical; only non-penalty approach bunkers ADDED). `GENERATOR_VERSION` 38. Part of the
    hazard-DISTRIBUTION follow-up to GS-biome-variety (the sibling green-END-variety + in-fairway-water/
    split-fairway passes are next).
  - IN-FAIRWAY WATER + SPLIT FAIRWAYS (GS-fairway-water): penalty water only ever FLANKED the corridor
    (`clearsPlayCorridor`), so "no lakes on/interrupting fairways and no split fairways". This pass bites
    INTO the corridor at a WIDE landing zone while keeping the CENTRELINE (the safe line AND the auto-AI's
    aim) DRY — so it's fair by construction (a middle shot is always clean) and the auto-AI is UNCHANGED:
    a CAPE (a lake eats ONE side; carry the corner or bail to the dry lane) or a SPLIT (an off-centre
    hazard STRIP + a parallel ALTERNATE fairway lane — main route down the dry centre, shortcut lane past
    the hazard). WATER on water worlds is marked `sanctioned` (exempt from `validateFairness`'s flank rule,
    the greenside-ring pattern) and proven fair by the new `validateInFairwayWater` (the centre route stays
    penalty-free through the fairway BODY, `t 0.1–0.82`, so it never coincides with the near-green ring);
    dry worlds get a NON-penalty rough/bunker bite (needs no sanction). Par 4/5, non-lost, wildness-gated
    (`FW_WATER_MIN_WILDNESS` 0.32), ONE per hole, skipped when a crossing already interrupts the hole.
    Drawn on a DEDICATED side stream (`${seed}:fwwater:`) → perturbs ZERO main draws (terrain/hazards/
    greens byte-identical; only this feature ADDED). The STRUCTURAL fairness contract is NOT relaxed —
    `generateCourse` throws (via `validateInFairwayWater`) on any bite that reaches the centre.
    `GENERATOR_VERSION` 40. Last of the hazard-distribution follow-ups to GS-biome-variety.
  - OB = stroke-and-distance off the play-bounds box (which doubles as the OB trigger — don't
    shrink it casually).
  - All new generator draws gate on their feature being armed (contract 1); current
    `GENERATOR_VERSION` 19.
  - A STATIC course is a pinned `StaticCourseSpec` (`seed`/`opts`) REBUILT on demand through the live
    `generateCourse` pipeline (GS-static-courses, `course/staticCourses.ts` + `staticCourseSpecs.ts` —
    `docs/decisions/static-courses.md`): `buildStaticCourse(id)` / `metalEighteen()` regenerate it (the
    default), DETERMINISTIC within a `GENERATOR_VERSION` (same layout every play; a version bump re-rolls
    it, the accepted cost of a lean unfrozen bundle for a casual records chase). `{regenerate:true}` /
    `regenerateStaticCourse` / `npm run gen:courses` are the same path (a seasonal-redesign / rebalance /
    re-freeze hook), re-validating the course so a redesign can't ship an unfair hole. NO COURSE IS FROZEN
    (GS-biome-variety): a course COULD be frozen to a byte-identical `course/static/<id>.json` via a
    `FROZEN_COURSES` row (the mechanism is kept, `buildStaticCourse` deep-clones a frozen singleton so the
    run path's in-place stamping can't corrupt it), but freezing all ~15 tour courses would add ~2.5 MB, so
    even the flagship `metal-18` "Antlia Scrapworks" — the `scrap-belt` (metal) archetype,
    `{holes:18,compose:true,wildness:0.5}`, formerly the ONE frozen exception — now regenerates, keeping the
    18-hole formats uniform (no exception) and letting each course reflect the latest per-world design (e.g.
    the GS-biome-variety Scrap Belt crater fields). A course's exact par thus shifts with the design; its
    identity is a VALID varied routing in the ~69–73 band (guarded by `tests/static-courses.test.ts`), not a
    pinned number. The catalogue is a ROW, never hand-authored geometry. A tour course
    row carries star-map metadata (`themeId`/`archetype`/`tier`/`blurb`) that does NOT feed generation. Every
    Star Tour row (NOT flagship `metal-18`, which keeps a fixed `wildness: 0.5`) sets `opts.wildnessMix` = `STAR_TOUR_MIX` `{medium 0.6, hard 0.85}`
    (GS-star-tour-difficulty): each hole rolls its wildness INDEPENDENTLY from that discrete set via the
    composer's `planWildnessMix` (gated on `GenerateOptions.wildnessMix`), so a Star Tour round mixes
    medium/hard holes and may come out all-one-level — fine for a solo stroke-play records chase with no
    death-spiral cut. `meta.wildness` = the mix midpoint `STAR_TOUR_WILDNESS` (0.725) for the intro number.
    OPT-IN + Star-Tour-only: the Voyage/Unending never pass a mix, so their mean-preserving arc AND byte
    output are untouched (no `GENERATOR_VERSION` bump — no fixed-opts output changed). No `_gs*`/URL hook
    (no test-hub wiring).
  - STAR TOUR — the third game mode (GS-star-tour, format `strokeplay`, `formats.ts` `STROKEPLAY_FORMAT`):
    a single 18-hole STROKE-PLAY round on a player-CHOSEN static course, ranked into personal course-record
    leaderboards. `Run.staticCourseId`/`staticEffect` pin the course + weather; `currentCourse` branches on
    `staticCourseId` (which NO other format sets → generated path byte-for-byte unchanged) to serve
    `buildStaticCourse(id)` and apply the chosen weather sky as PURE physics (`applyEffectPhysics` — wind/
    carry only, NO geometry change, so records stay comparable across weather). The round is resolved like
    Asgard (a bespoke reducer path, not the Stableford-cut/travel flow) — the single stop IS the whole run.
    Records live in `sim/rpg/strokePlay.ts` (`StrokePlayBest` = courseId → best round, a MAP so a course's
    all-time best is never evicted; ranked by TO-PAR asc, ties → fewer strokes): two boards, per-course best
    + best-rounds-overall. Persisted in save v27 (`strokePlayBest`). Threaded through both the auto
    (`playCourse`+`playTotals`) and interactive drivers (contract 2). The mode does NOT touch Voyage/Unending
    behaviour.
  - EARTH — the HOME course (GS-earth): the one real-world course, the Old Course at St Andrews, is the
    Star Tour destination you reach by flying to the Earth landmark. It is a NEW `earth` BiomeArchetype +
    `earth-links` Biome (a true Scottish LINKS: `carryMult` 1.0 — the only real-Earth gravity — seaside
    wind, treeless firm turf, deep revetted POT bunkers, fescue/gorse rough, the Swilcan BURN carry, huge
    undulating SHARED double greens). WEIGHT 0 + no pickable theme ⇒ out of the normal galaxy rotation,
    reached only by the static course forcing the biome by id (the Asgard pattern; kept mid-`BIOMES` so
    the last row stays positive-weight for the `pickBiome(0.999)` span test). NOT balance-exempt — a fair
    world, so it clears the fairness/death-spiral bars (auto-AI plays it ≈ even par). The `standrews-18`
    spec (`The Old Course, St Andrews`) is an UNFROZEN tour row like the others EXCEPT it PINS the real
    par-72 routing (`opts.parSequence`, GS-hole-plan) and uses the designed difficulty ARC — NOT
    `STAR_TOUR_MIX` — so a real course opens gentle and builds through the closing stretch. A new
    archetype = a row in every archetype-keyed table (compile-forced: `ARCHETYPE_BIOME`/`ARCHETYPE_AFFINITY`/
    `ARCHETYPE_TURF`/`ARCHETYPE_SPACE`/`OB_LOOK`/`BIOME_RELIEF`/`WIND_COL`/`TREE_VOICES`/`TREE_GLYPH`/`PRO_LOOK`/
    `MUSIC_TRACKS`/`ZONES`/`PROS`; test-forced: `GROUND_COVER`/`WIND_RGBA`/`AMBIENT`; plus `BIOME_ROUGH`/
    `ACCENTS` by biome id, `DEEP_ROUGH`, a `zoneHeroSVG` branch), never an engine fork. Star map: Earth is
    the tappable Old-Course target — `worldPos` special-cases `themeId:'earth'` → the blue-marble
    `EARTH_POS`, and `earthGlyph` (not a generic constellation planet) carries the selection ring + record
    + play flow. Guarded by `tests/startour-flow.test.ts`. Pure render/data + a static row — no `_gs*`/URL
    hook, no test-hub wiring.
- **RPG meta-loop** — `docs/decisions/rpg-meta-loop.md`
  - The spine: `startRun → [playStop → buy* → travel]*` until the survival rule fails; pure and
    deterministic. The **Voyage** is the winnable campaign (3 arcs, boss each, `endedReason 'won'`);
    the **Unending Universe** is the ONLY endless format (`flat`/`ladder` retired — `getFormat`
    folds their ids).
  - Endless survival is a PER-SET (per set-of-four = per stop) CUMULATIVE bar (GS-set-survival,
    `endless.ts`): the four-hole total `Σ(strokes−par)` must clear the set's allowance, RESET each
    set — so one blow-up hole (capped at par+MAX_OVER_PAR) never ends the run, only a set boundary
    does. Allowance ramps every two sets: +4 (sets 1–2) → +3 → +2 → +1 → E → −1 → −2 → −3, capped
    at −4 (`ENDLESS_SET_STEPS`, keyed off `run.stopIndex` = holesSurvived/4). Threaded IDENTICALLY
    through `playStop` (plays the FULL set, no early break) and the interactive `holeComplete`
    (contract 2). DEPTH (sets cleared / holes reached) is the SOLE metric — there is NO run-total
    score (gross/to-par/net removed); the leaderboard ranks purely on depth (ties → most recent).
    The starting CLUB SET is the difficulty axis (a weaker bag makes the thresholds harder, no
    handicap math); finished runs bank into the persisted `endlessRuns` leaderboard. `grossStrokes`/
    `parPlayed` are retained on the Run/record for save-shape stability but never shown or ranked on.
  - WARP fast-forwards only PROVEN holes under the hidden automatic-birdie rule: `canWarpStop`
    requires a contiguous warp prefix fitting under `endlessBestHoles` — new ground is always
    hand-played; a warped stop banks NO milestone shards and never grants the ace ship; leaderboard
    rows carry their honest hole range.
  - FUEL: every jump burns `routeFuelCost` off `Run.fuel` — distance ± the SKY's tail/headwind
    (`effectFuelDelta`, derived + zero rng; a headwind sky never rides a calm-category lane —
    machine-checked), floored at 1. ONE rule lives in `travel` (auto ≡ interactive by construction)
    — a short tank buys the shortfall at the LOCAL depth-scaled price, printed on the Jump button,
    never silently; tanker events (`RouteEvent.fuelBonus`, desc must state `refuel +n ⛽`) refuel on
    arrival there too, capacity-clamped. Unaffordable lane ⇒ locked; all locked ⇒ run ends
    `'stranded'` — the SECTOR SCAN is the lifeline: burn fuel to redraw the lanes (escalating
    price, always leaves ≥1 cell; `Run.routeScans` re-keys `routeOptions`' stream and is
    snapshotted so a resume keeps the offer you paid for; scan 0 = the classic stream,
    byte-identical). Fuel is drawn ONLY via `render/fuel.ts fuelGaugeHTML`, never a bare number.
    Ship outfitting (thrusters/reserve tank/eagle siphon) rides perk ids — the Reserve Tank's
    fuel pours ONCE in `buy`, never in `apply` (resume would double-grant).
  - Milestone cosmetics are EARN-ONLY (`unlockHoles` rows; `canBuy*` refuses); a hole-in-one is the
    only way to earn the secret Comet Rider ship (`aceUpdates` on ANY ace, not a first-ace flag).
  - **ASGARD interlude** (`docs/decisions/asgard.md`; GS-asgard): an eagle-or-better on RAINBOW ROAD
    (`asgardPortalOpens`, reducer-only + gated on the ball → zero rng, feature-off byte-identical) opens
    the Bifröst — instead of the result/shop it diverts to the Himinbjörg map, then a nine-hole STROKE-
    play tournament on The Warrior's Tee (three bespoke `contender` golfers — Hogan/Frankie/Vince; `warriorsThreeTotals` ghost
    gross, lowest wins, ties→player). The field SCALES with the run (GS-asgard-scaling / GS-warriors-tune):
    `warriorsEdge(depth, ascension, voyage)` sharpens every warrior by a per-hole stroke `edge`. The
    Warriors are effectively a boss match but LOSING costs nothing (no run ends), so they sit ABOVE an
    ordinary boss, tuned per CONTEXT: the VOYAGE Bifröst (`voyage=true`, `asgardReturn` present ⇒ the
    player arrives upgraded) rides a flat `WARRIORS_VOYAGE_BASE` (0.2) floor so even an EARLY Rainbow-Road
    eagle is "slightly harder than an Arc-III boss", then DEPTH+Ascension sharpen to `WARRIORS_VOYAGE_CAP`
    (0.34) — a strong upgraded round (≈6 under) still wins ~12–25% (beatable, never a brick wall); the
    STAR TOUR / Yggdrasil realm (`voyage=false`, no parked run) stays the gentle default-bag baseline
    (edge 0, ≈5-under Warriors, the easier venue). `asgardFieldEdge` picks the context off `asgardReturn`
    and feeds BOTH the verdict and the live board; `edge=0` (Star Tour / base) is byte-identical. The
    real run is SUSPENDED (`asgardReturn` snapshot); the Asgard run
    (`startAsgardRun`, format `asgard`, `pendingTheme` = the `ASGARD_THEME` object so it never needs a
    THEMES entry) plays the player's bag MINUS the Rainbow Ball. It is NEVER persisted (`persist` parks
    `asgardReturn` instead → a mid-tournament quit resumes the journey). Win OR lose, the return strips
    `rainbow-ball` + sets `run.rainbowConsumed` (the shop never re-offers it); a WIN also banks the
    Thor's Hammer cosmetic + the `talent-odins-favour` perk. Then it resumes at the travel screen.
  - The cosmetic **`driver` apparel slot** (GS-thor) is the club skin the golfer swings ON THE DRIVER SHOT
    ONLY — `playView` strips `look.driver` when `shot.club.id !== 'D'` so irons/wedges/chips swing the plain
    (or gear-themed) club; the clubhouse/market previews show it unconditionally. Thor's Hammer is `secret`
    (earn-only, hidden until owned) and won on Asgard. Same EQUIP/reveal plumbing as the other slots (save
    v22 `driverByCharacter`); rendered in the swing + leaning at the clubhouse fireplace.
  - **Per-golfer bag rarity / difficulty** (GS-wardrobe-bagtier, save v23 `bagTierByCharacter`): each
    golfer's STARTING BAG in EVERY mode (Voyage + Unending), chosen in the Clubhouse wardrobe's BAG slot
    (`bagTierForCharacter` reads it, clamped ≤ the owned `bagTier` — never a free upgrade; picking the
    owned tier CLEARS the override so a golfer defaults to the owned tier). Fed into `startRun` by
    `selectCharacter` for ALL formats. Buying a new bag tier (`buyBagTier`) RESETS the whole map (`{}`) so
    every golfer auto-jumps to the fresh best tier; the player re-picks a weaker bag per golfer afterwards.
    The char-select club-set strip (Unending only) stays a per-run OVERRIDE sent only when TAPPED
    (`selClubSetTouched`) so an untouched strip can't clobber a golfer's stored pick — an explicit strip
    pick write-throughs to the golfer. Default path (empty map ⇒ owned tier ⇒ common) is byte-identical.
    Meta only, no rng.
  - The equipped cosmetic **BAG** now shows ON THE COURSE (GS-wardrobe-bagtier, `GolferLook.bag`): a staff
    bag propped BEHIND the golfer (−x, clear of the target-side swing arc), the canvas `drawGolfBag` mirror
    of the wardrobe SVG `bagGlyph`. With no cosmetic bag the clubs still carry their bag-TIER gear skin
    (`equippedGearTheme`); the cosmetic DRIVER still overrules the club head on the driver shot.
  - Pro Shop rarity is VOYAGE-paced (`voyageRarityBias` keyed off the STOP; endless keeps
    `rarityDepthBias`) — it reweights WHICH item is drawn, never the rng COUNT. Every shop item is
    a one-shot; the `stackable` plumbing stays dormant for save back-compat.
  - Two currencies: per-run **credits** (shop perks), cross-run **Star Shards** (cosmetics + bag
    tiers). Cosmetics split BUY (Trade Market, global ownership) vs EQUIP (Clubhouse, per
    character); every unlock-gated item is HIDDEN until unlockable — ONE reveal predicate per
    catalogue drives the filter. `CosmeticRarity` (mythic tier) stays OUT of the sim's loot `Rarity`.
    Trade Market prices (ships/apparel/bag tiers) are tuned only in their three tables; the Pro Shop
    (credits) is a SEPARATE economy — never touch it for a Trade Market rebalance. A price change with
    a player refund is a SAVE MIGRATION with OLD prices snapshotted in the step (never read live —
    migrations must be edit-proof), stamping a one-off `priceRefund` notice cleared on dismiss
    (GS-trade-rebalance).
  - The Clubhouse (hall lounge + per-golfer stage + spaceport) is purely cosmetic, seeded via `Rng`
    keyed off `clubhouseVisit` — zero sim/rng-stream impact. Mount figures/ships in TIGHT frames
    (golfer 72×210, ship 96×62); re-shoot `scripts/clubhouse-preview.mjs` after touching
    `apparelArt.ts`/`clubhouseLounge.ts`. The spaceport is ONE cohesive floating golf-deck that reads
    as the view out the bar's picture window (same sky/ringed-planet/moon as `loungeArt`, a warm "19th
    Hole" clubhouse twin at its back): the four golfers are dealt across FOUR berths (`BERTHS`) — three
    holo pads + one FUEL station — by the visit shuffle, so the fleet re-parks AND a different equipped
    ride tops up at the pump each run. Every ride stays the `openClubhouse` button; the ONLY randomness
    is the berth shuffle (which also picks the pump occupant). GS-clubhouse-starport-redesign.
  - GENDER PRESENTATION lives ONLY in the head layer (GS-avatar-gender): each golfer's `GolferStyle.hair`
    (a chosen hairstyle + optional stubble, `golferPreviewSVG` opts.hair → `hairLayers`) is drawn strictly
    ABOVE THE NECK. The body silhouette, torso, limbs and every cosmetic garment are byte-identical for all
    golfers, so outfits stay fully gender-neutral (no chest/curve shaping — ever) and drape the same on
    everyone. A SEALED helmet (`hat.look.shape === 'helmet'`) hides hair, so all four read identical in a
    spacesuit. Hairstyles are a length/shape spectrum any golfer could wear; the row just picks the look.
  - Won Ascension gates unlock permanent bag TIERS (`applyBagTier`, baked at `startRun`/`resumeRun`;
    a Pro-Shop floor; no-op at `'common'`). A per-character Ascension clear unlocks one random club
    (`unlockedClubsByCharacter` stores TYPES, re-stamped by `applyBagTier`). `ASCENSION_MAX = 15`.
  - The reducer's exported `runEndUpdates` is the SINGLE source for all run-end sites.
  - The travel screen is ONE FULL-SCREEN STAR MAP framed by sticky glass chrome (GS-journey-map-redesign,
    `travelScreens.ts`; superseded the GS-journey-cockpit status-strip + comparison-rail + docked-sheet).
    The MAP fills the ENTIRE viewport (`.gs-journey--v` PANS at intrinsic size — never scales down, so the
    zoom-out-to-unusable bug can't return; a fresh stop shows with NO scroll). STICKY chrome is absolutely
    anchored to `.gs-travel__viewport` (not the scrolling chart, so it never scrolls with the map) as a
    BRIDGE HUD (GS-journey-hud, `.gs-bhud`): a starship command FRAME — glowing corner brackets + a bottom
    command BAR (`.gs-bhud__console`) that COMPLETES the page. It is deliberately SHORT (~60px) so the MAP stays
    the hero (GS-journey-map-hud-tweaks — a tall sculpted dashboard tried earlier ate half the chart and was
    rejected). It's a premium ship-tinted GLASS strip floating above the map on a drop shadow, seating three
    instruments as ONE cluster with a clear hierarchy: two dark RECESSED readouts — the 🚪 EXIT switch (left,
    bank/end run, two-step confirm) and the ⛽ FUEL lit readout (right) — flanking one glowing raised COMMAND
    dial, the 📡 SCAN (centre focal point). The FUEL is a compact HORIZONTAL `fuelGaugeHTML({icon})` (⛽ · segment
    cells · big count) recessed like an instrument screen; it grows along its WIDTH as capacity upgrades and the
    count is the authoritative value (this is the settled answer to the fuel-sizing saga — a vertical tower/pod
    made the bar too tall; a short bar + horizontal readout keeps the map the hero). Recolours to the flown ship
    via `--hud-*`; each `.gs-bhud--<variant>` re-tints the glass + its own top-rail `::before` (wagon chrome
    lip / racer stripe work again on a flat bar), so a livery is still a table row. The map's bottom-pad +
    feather-mask clear the ~60px bar. (This SUPERSEDED three rejected takes — a floating fuel PILLAR + poking
    scanner keystone; a flat row with fuel crammed in a fixed no-grow slot; a 128px `clip-path` sculpted panel
    that covered too much map.) The old separate `.gs-travel__topbar` status
    strip + the floating `.gs-cog` are GONE (GS-journey-map-hud-consolidate): the golfer identity + run
    progress dock into a top-LEFT glass pod (`.gs-bhud__idpod`) and the credits + settings cog into a
    top-RIGHT pod (`.gs-bhud__statpod`) — the top-edge twin of the bottom console, so all four edges of the
    frame are furnished and the screen reads as ONE command deck, not a strip over a disconnected map. The
    docked `.gs-bhud__cog` dispatches the same `data-open-settings` as the global cog, which `app.ts`
    SUPPRESSES on the travel screen (like the full-bleed play view) so there's no double button. The pods
    recolour to the ship via the SAME `--hud-*` props and leave the frame's top CENTRE clear for a livery
    title plate. TOP-BAND SPACING (GS-journey-map-hud-spacing): the ship-name title plate owns the very top
    ROW; the id/stat pods dock a ROW BELOW it (`top:44px`) so the livery name never overlaps the golfer
    name / credits, clearing the centre-hanging ornaments too (wagon dice ~41px, racer stripe ~40px, feather
    wings) — the `standard` no-plate console rides its pods back up to `top:12px`. The scrollable map
    (`.gs-travel .gs-journey--v`) is INSET (top pad past the pods, bottom pad past the console row)
    AND feather-MASKED top+bottom, so a long voyage's route worlds never slide up UNDER the pods and Earth
    never pokes past the console outside the frame (both dissolve into the chrome instead). The frame
    RECOLOURS + RESHAPES to the flown ship via `hudThemeForShip`
    (`render/hudTheme.ts`) → `--hud-*` custom properties + a `variant` on `.gs-bhud`; a per-fleet livery
    is a `SHIP_HUD` table ROW (keyed shipId → set → standard cyan) with a `variant`, its frame SHAPE a
    `.gs-bhud--<variant>` block, its bespoke CHROME a `render/hudChrome.ts` builder (bridge ICONS + labels
    + frame ORNAMENTS) — never a layout edit. **GS-fleet-bridges**: EVERY set now carries a `variant`, so
    flying a different ship gives a genuinely different command deck — a wagon's woody road-trip dash
    (compass/fuzzy-dice), a racer's redline carbon cockpit (tachometer/checkered stripe), a hauler's
    riveted freighter, an alien saucer's orbital-ring probe deck, a neon bike's double-rim speedo, the
    Asgardian Pegasus's runic war-bridge (rune-ring/shield/bronze wings), the Mothership's chasing
    light-ring saucer deck, the Comet Rider's dimpled golf-ball cockpit, the Thunderbolt's flame-lick
    chopper — each with its own scanner/exit/fuel instruments and its ship NAME on the title plate
    (`hudChromeFor(variant, ship)`). The SHARED ornament + instrument BASE (title plate / rails / nodes /
    wings / themed SVG icons, all reading `--hud-*`) lives once; each `.gs-bhud--<variant>` re-tints or
    reshapes it. **GS-fleet-dashboards**: each livery also drops a bespoke `HudChrome.deck` — a physical
    instrument CLUSTER (`.gs-bhud__deck`) — into the console's LEFT gap (the reliably-clear ~90px between
    the exit switch and the centre command dial; the fuel readout owns the right gap, growing with tank
    capacity), so a dashboard reads as its OWN cockpit, not the same three pills recoloured: a woody
    STEERING WHEEL + speed dial (wagon), a redline tach + toggle bank (racer), rune stones + a bronze gauge
    (Valkyrie), a saucer light-ring dial (Mothership), an oscilloscope (neon bike / Infinity Ace), … built
    from a shared `DECK` instrument kit (wheel/gauge/redline/switches/leds/faders/knob/wave/runes/saucer/
    dimple SVGs, all reading `--hud-*`) composed via `deckRow(...)`. The deck is pure decorative SVG —
    absolutely anchored between exit and dial, painted BELOW the controls (`.gs-bhud__slot` gets
    `z-index:1`), `pointer-events:none` so map taps + buttons are untouched, mask-faded + `overflow:hidden`
    so it clips if the gap is tight. `''` for the standard console → byte-identical. A new fleet's deck is a
    `deckRow` of kit pieces + `.gs-bdeck*` CSS, never a layout edit. The **Infinity Ace** (GS-infinity-hud, the hole-150 grail) is the reference full reskin:
    `variant:'infinity'` unlocks `.gs-bhud--infinity` (a rotating living-aurora ring — @property
    `--gs-aur-angle`, the ship's gold→emerald→aquamarine→violet palette — gold double-rim + inner wash,
    a phoenix-wing CANOPY, breathing corner L-brackets) AND its chrome swaps the controls for a
    sensor-sweep SCANNER, an airlock EJECT hatch, and a plasma-cell fuel glyph (via `fuelGaugeHTML`'s
    `icon` opt); its icons read the `--aur*` props. `hudChromeFor` returns `null` only for an UNKNOWN ship
    (the classic 📡/🚪/⛽ cyan console, byte-identical); all ornaments are `pointer-events:none` (map taps
    still pass), and every animation is off under reduced-motion (degrades to a rich STATIC deck). Pure
    render + data (no reducer/save/rng/`_gs*`/URL hook). Eyeball any bridge via `scripts/travel-preview.mjs
    QS="?ship=<id>"` (wagon-classic / racer-redline / ufo-mothership / infinity-ace / …). Its base class MUST stay `.gs-bhud`, NOT
    `.gs-hud` (the play screen's own HUD class): a shared `.gs-hud` here once stretched the play screen's
    `.gs-glass` chrome into a full-screen map-blur (GS-hud-class-collision, guarded by the play-HUD layout
    test in `tests/build.test.ts`). `.gs-bhud` is `pointer-events:none` so map taps
    pass through; only the console controls catch touches. Tapping a world (`data-route-inspect`) raises
    `laneCard` over the bottom HALF (z-index above the HUD) — world + weather LORE (`BIOME_LORE` +
    theme/effect blurbs), Boons & Rewards vs Hazards & Conditions chips, the Jump action. Only ONE bottom
    overlay at a time (`travelView.selectedRouteId`/`depotOpen`/`exitOpen`, priority exit > depot > card).
    Pure app/render — the `{type:'route'}`/`scanRoutes`/`bank`/`strand`/`buyFuel` actions are UNCHANGED
    (no reducer/save/rng impact, no `_gs*`/URL hook). Re-shoot `scripts/travel-preview.mjs`
    (`?select=N`/`?depot=1`/`?exit=1` variants) after touching it.
  - Route choice carries destination biome + an event that is economy/cut/meta only — **NEVER
    generation rng**. Every non-none course effect carries a REAL play hook, machine-checked
    (`tests/journey-effects.test.ts`): wind/carry multipliers are pure post-gen scales; geometric
    hooks (tents, scorch craters, ground patches) are pure seeded per-kind streams drawn + played
    from the SAME source. The route card states every hook. A new course effect = a
    `COURSE_EFFECTS` row + a `routeEffect` mapping + a `weather.ts` showpiece on its OWN stream.
  - Weather is biome-INDEPENDENT (it rides the route EVENT, gated by journey ARC via `minArc`, never by
    the world), but a SOFT thematic affinity (GS-weather-affinity, `EFFECT_BIOME_AFFINITY`) biases a
    weathered lane's DESTINATION toward a fitting world — a blizzard leans cold, a dust storm desert/scrap.
    It's a `pickThemeFrom` WEIGHT boost inside the lane's own (separate) theme rng draw, SAME draw count,
    so the `:routes:` stream (distances + events) is byte-identical and an affinity-LESS sky (moonlight,
    nebula, …) draws exactly as before. Soft not hard: a fitting world is only ~most-likely, mismatches
    stay possible. A new weather with a thematic home = one `EFFECT_BIOME_AFFINITY` row (guarded in
    `tests/journey-effects.test.ts`). Because a biome only meets an arc's weather, keep each archetype
    spanning ≥2 arcs (constellation `stars`) so it isn't locked to one arc's skies.
  - Trade tents ring EVERY hole of a tradeMarket stop; effects are dealt per hole so colour never
    predicts. Only the marmot changes the shot (deterministic lost ball in `executeShot`, auto ≡
    interactive); the other four are interactive-only reducer meta.
  - A `salvage` lane loots a CLUB (private stream keyed to the DESTINATION
    `salvage:<seed>:<arrivingStop>:<eventId>`, rarity floored at rare, resume-safe as a shop perk id,
    only ever raises Stableford). It's a BLIND gamble (GS-salvage-mystery): the route card previews only
    the TIER, never the exact club — each salvage stop is its own roll, so skip it and the next lane's loot
    may differ. The grant still resolves from that same stream in `travel` (auto ≡ interactive), so the
    mystery is presentation-only. Route events carry no `shardBonus` — shards are run-END rewards;
    `run.bonusShards` moves only via endless milestones.
  - The three route lanes land DISTINCT archetypes, never the current one (filtered redraw, not a
    retry loop). A fresh run opens RANDOM + non-hard (stop 0 skips `HARD_ARCHETYPES`; same single
    draw off a filtered pool). Characters/talents/ace rewards ride `loadout.perks` ids, rebuilt on
    resume (no save bump).
  - Bosses play on a separate `:boss` rng and SCALE with Ascension via `bossEdgeForRun` (the ONE
    source for headless AND reducer); A0 + a common bag + Arc-I is the classic boss, byte-for-byte. The
    auto-AI pin-hunts via `PlayHoleOptions.attackPin` (default off = byte-identical), armed for
    endless bogey-or-tighter bars and high-Ascension bosses; `playHole` takes `puttSkill` so putter
    perks reach the headless putt-out.
  - The voyage's three bosses ESCALATE, not just scale flat with Ascension (GS-boss-escalation): the
    boss's `cutBonus` (1/2/3, arc order) maps to an `arcRank` (0/1/2) on `BossEdge`, which sharpens the
    boss LOADOUT — handicap −`BOSS_ARC_HANDICAP`/rank, distance +`BOSS_ARC_DISTANCE`/rank, dispersion
    −`BOSS_ARC_DISPERSION`/rank — so the Arc-II boss is harder and the Arc-III FINAL harder again, INDEPENDENT
    of Ascension. The final (rank 2) also pin-hunts even at A0 (`BOSS_ARC_ATTACK_RANK`). This revived
    `cutBonus`, which was INERT for matchplay bosses (they pass on the DUEL `matchWon`, never the Stableford
    cut, so the +1/+2/+3 never bit). Rank 0 (Arc-I, and the default `BossEdge`) is byte-identical to the
    classic boss; a grown bag can still out-club the climb (`tests/boss-scale.test.ts` guards the escalation +
    the strong-build voyage win). The Asgard Warrior's Tee is a separate stroke-play ghost (see below).
- **Competition & leaderboards** — `docs/decisions/competition.md`
  - The field is a deterministic STATISTICAL ghost (`ghostHoleStableford`), not N real ball-sims.
  - Voyage survival is your POSITION in one persistent field thinning to the final two;
    `competition.ts` is the single source for the drawn board AND real survival. The cut thins GENTLY
    so the leaderboard keeps VARIETY the whole way and CONVERGES to 2 only at the FINAL ordinary stop
    (GS-cut-variety): base curve `VOYAGE_SURVIVOR_TARGETS = [16,13,10,8,5,2]` with a PER-ORDINAL floor
    `VOYAGE_SURVIVOR_FLOORS = [10,8,7,5,4,2]`, so even at `ASCENSION_MAX` the field stays a real,
    descending set through arcs 1–2 (≥7 mid-arc-2) and only the last ordinal reaches 2. Ascension
    tightens the EARLY cuts but can NEVER flatten the curve to its floor (the old flat floor of 4
    collapsed a hard voyage to a four-golfer board for two arcs); high-Ascension difficulty rides the
    field's strength (`voyageFieldEase`→0 by A8) + scaling bosses, and the binding survival gate is the
    final top-2 (even-par A8 survival stays ~brutal, `a8<0.15`).
  - LOW-Ascension ghost-field EASE (GS-green-ease): `voyageFieldEase(ascension)` hands the whole AI
    field back `VOYAGE_EASE_A0` (0.66) SF/hole at A0 — held across A0–A4, faded to 0 by A8 — so a
    green-bag player shooting ~even par is competitive at the gentle tiers (cut-survival ≈84→61% A0→A4)
    instead of getting positionally cut mid-field, while BELOW-par golf still misses the cut. It's
    `ghostHoleStableford`'s `ease` param (default 0 = original field, byte-identical; applied to `base`,
    ZERO extra rng), carried on `ArcStopSlice.fieldEase` (voyage-only) so survival AND the live
    leaderboard apply the SAME ease. Eases the CUT only — the matchplay BOSSES stay the hard climax.
  - `league.ts` imports `run.ts`, never the reverse; the matchplay boss-id resolves in the UI reducer.
- **Caddies** — `docs/decisions/caddies.md`
  - One named caddy on the bag at a time, but hiring a NEW one FIRES the incumbent (GS-caddy-factions,
    `buy` rebuilds the loadout minus the fired caddy's perk) — NOT a no-op. A fired caddy lands in
    `Run.firedCaddies` and is never offered again THIS run (returns in future runs); the shop keeps the
    OTHER caddies offerable so a swap is always possible. All caddies are LEGENDARY (equal scarcity —
    no "Dan's just the one that showed up"); the four ex-epics (Dan/Sam/Sandy/Mole) got a small buff.
    Each folds ONE loadout field. THE RULE (machine-checked): every `NAMED_CADDY_IDS` entry surfaces a
    `caddyEffects` row AND a `factions.ts` faction.
  - FACTIONS + REPUTATION (`src/sim/rpg/factions.ts`) are HIDDEN groundwork — nothing renders them yet.
    Every caddy belongs to a faction; hiring earns `REP_ON_HIRE` (+1), firing costs `REP_ON_FIRE` (−3),
    tracked PER CHARACTER (`reputationByCharacter`, save v21). Reputation is a UI/save concern moved by
    the reducer's `buy` case — the sim `buy()` only does the fire mechanic (so auto ≡ interactive; the
    headless/Lab path never touches reputation). The UI gates the fire behind a "they won't be happy"
    confirmation (`pendingFireCaddy` → `confirmFire`); the sim fires unconditionally.
  - CREDIT TOKENS are faction-branded too (GS-credit-factions): each of the four credit-boost shop items
    is ISSUED BY a distinct faction (`CREDIT_ITEM_FACTION`) — Sponsor's Badge +15% → Sponsors' Syndicate,
    Lucky Ball Marker +20% → Fortune Cartel, Birdie Hunter → Birdie Hunters, Eagle Eye → Eagle Order —
    machine-checked DISTINCT. The card wears its house CREST on a medallion (`factionCrest`/
    `drawCreditToken`; `itemArtSVG` intercepts a credit id before the base gear switch). Pure render +
    data, zero rng, no save bump — the `apply`/mechanic is untouched. A new credit item = a
    `CREDIT_ITEM_FACTION` row + a `FACTION_CREST` emblem.
  - Guard redirects + chip-ins add rng ONLY when armed + qualifying. A guard's `side` is a FAIRWAY
    side classified off the hole's `centreline` (`ShotInput.fairwaySide`), NOT the shot bearing.
  - A Space Ducks / Convict Sheep FAIRWAY save snaps the ball HOME to the fairway SPINE, not the aim line
    (GS-caddy-snapback, `ShotInput.fairwaySnap` closed over `nearestFairwayPoint`): the old recentre-onto-
    the-BEARING left a save in the rough whenever the miss was aimed far off the fairway (the bearing points
    into the rough, so a de-spread version of it still lands off). Now however far offline the miss went, it
    comes back onto the short grass. Greenside saves still land ON the green (`greenAim`). Guard-only (a
    guard-less shot passes `undefined` → byte-for-byte), consumes the SAME single `sampleGreenAngle` draw
    (draw count stable), resolved in the shared `resolveShot` (auto ≡ interactive). On a walled derelict the
    fairway spine IS the deck spine, so this subsumes the old GS-ship-wall-caddy snap (kept as a backstop).
  - On a WALLED derelict corridor a guard save is DECK-AWARE (GS-ship-wall-caddy, `executeShot`): the
    guard recentres a miss onto the aim-BEARING line, which runs off into space on a BENDING ship
    corridor, and the wall bounce then re-processed that fictional curve-back arc (~81% of caddy saves
    double-handled, ~7% flung back into space — the "caddy interacts really badly" bug). So on a walled
    hole a redirect (a) snaps its landing to the nearest ON-DECK centreline point (the deck spine) when
    the recentre lands in space, (b) SKIPS the flight wall bounce (the guard's placement is final), and
    (c) is STICKY — a still-lost redirected rest is seated back on the deck. Guard-only + walled-only →
    byte-identical everywhere else; a caddy save now finishes on the deck ~98% fairway, 0% lost.
  - The renderer draws the guard figure ONCE (the corner figure) — never also float the portrait badge.
  - The **Prognostic Parrot** (GS-caddy-parrot, faction **Space Bandits** — the merged pirate crew that
    also fields the Convict Sheep) reuses the SCRAMBLE machinery:
    `loadout.previewScramble` (0.33) is a per-full-swing proc where the pirate captain FORESEES the shot →
    you play a SECOND ball with the player's OWN golfer (`opts.shotMods`, never a partner) and keep the
    better (`pickBetterExec`). Threaded IDENTICALLY through the auto sim (`playHole`, gated `!opts.scramble`
    so a team duel wins) and the interactive reducer (`'shot'` shows the foresight choice card via
    `resolveScrambleShot`+`{preview:true}`; `autoShotHole`/watch auto-keeps like headless) — the proc is ONE
    `rng.bool(chance)` drawn BEFORE the shot in BOTH, so undefined/0 is byte-for-byte and best-of-two only
    ever RAISES Stableford (contract 4 by construction). It's NOT a guard/projectile caddy, so no
    `_gsFeel.forceRedirect` case — just the `caddyEffects` row + faction the RULE demands.
- **Lore / story beats** — `docs/decisions/lore.md`
  - Lore is CONTENT-AS-DATA (GS-lore, `sim/rpg/lore.ts`): a beat is a `LoreEvent` ROW — a pure
    `trigger(ctx: LoreContext)` predicate + the presentation (`title`/`kicker`/`lines`/`portrait`).
    `pickLoreEvent(ctx, seen)` returns the first UNSEEN (`once`) beat whose trigger fires; a new beat is
    a NEW ROW, never an engine edit. `LoreLine.kind` = `say` (a dialogue bubble) vs `action` (a stage
    direction, dim italic). `LoreContext` (biome/archetype/caddyId/characterId/format/stopIndex/
    reputation) is deliberately broad — extend it for a beat that gates on more, and populate it in the
    gate. First row: `driver-dan-derelict` (`archetype === 'derelict' && caddyId === 'driver-dan'`).
  - A beat can PAY OUT, not just speak (GS-lore-rewards): the optional `LoreEvent.effects` is applied
    ONCE by `dismissLore` (still UI-only, zero sim rng) — `unlockShip` adds a secret ship to `ownedShips`
    (the ace-ship pattern), `parrotForesight` arms the Prognostic Parrot's foresight at 100% for the
    ARRIVED stop only. A new reward kind = a new `LoreEffects` field + one `dismissLore` branch. Second
    row: `prognostic-parrot-derelict` (GS-lore-parrot-firebird — `derelict && caddyId ===
    'prognostic-parrot'`): the parrot mourns his dead spirit-brother's wreck; dismiss grants the secret
    MYTHIC **Firebird** ship (`ships.ts` `FIREBIRD_SHIP_ID`, a black Trans-Am cruiser with a golden
    phoenix, `look.kind:'firebird'`) and 100% foresight here. The boon rides `run.parrotForesightStop`
    (snapshotted; `foresightChance(run)` = 1 when it equals the live `stopIndex`, else the loadout chance
    — so feature-off is byte-for-byte and it self-expires on travel), read by BOTH the headless
    `playerHoleOpts` and the interactive proc (auto ≡ interactive). A caddy is one-at-a-time, so the two
    derelict beats never collide.
  - One-off tracking is PERSISTED (`SeenLore = Record<string,true>`, save **v28** `seenLore`, mapped in
    BOTH `persist.ts` mappers): a beat fires exactly ONCE ever, across every run + mode, recorded on
    DISMISS. Save bump is purely additive (existing seeded runs byte-identical).
  - The gate `withLoreGate(next)` (`ui/gameUpdates.ts`, the `withAsgardPortal` sibling) wraps every
    "→ intro" arrival return (`route`/`pickStarTourCourse`/`selectCharacter`/`resume`); an unseen
    triggering beat diverts to the `'lore'` SCREEN (`pendingLoreId`), `dismissLore` marks it seen + lands
    on the intro. MODE-AGNOSTIC: derelict via `course.biome === 'derelict-ship'`, caddy via
    `namedCaddyOwned(perks)` — one gate covers Voyage/Unending/Star Tour, no run snapshot needed.
  - The screen (`app/loreScreens.ts`, full-bleed cinematic) paints a banner + a bespoke close-up
    portrait (`render/loreArt.ts lorePortraitSVG`, Dan's on-course palette) + the dialogue. CSS is
    `.gs-lore*` (its OWN prefix, NEVER the play HUD's `.gs-hud`). UI/RENDER ONLY — zero sim rng
    (determinism/auto≡interactive untouched); no `_gs*`/`?param` hook (only a new `?screen=lore`
    deep-link VALUE for the layout smoke test), so no test-hub wiring. Guards: `tests/lore.test.ts`
    (pure table + reducer flow) + `tests/build.test.ts` (`?screen=lore` smoke) + `tests/save.test.ts`
    (v27→v28). A new speaker = a `lorePortraitSVG` case; a new beat = a `LORE_EVENTS` row.
- **Putting** — `docs/decisions/putting.md`
  - Manual pace-meter by default; AUTO only via the Penelope Putter caddy. `takePutt(…, control?)`:
    control → manual, none → `onePutt` (auto/tests, byte-for-byte). Fringe-putt is interactive-only.
  - The make band SHRINKS with distance past the putter's `puttRange` (floored; =1 within range);
    the on-screen band draws the SAME shrunk window. Only the PACE window is distance-scaled;
    auto `onePutt` is untouched.
  - The break line STOPS DEAD at the confident read (terminus dot, nothing beyond) — read range is
    a visible gear axis (`puttSkillOf`, cap 1.0).
  - BACKSPIN IS OPT-IN, not universal (GS-backspin-optin): with contoured greens + random spin +
    random landing, a human can almost never chip in with backspin, and a full wedge can spin back so
    far you must land OVER the green and pray — so every player's every wedge no longer spins back.
    `clubRollFraction`'s wedge branch (PW and below) now tapers +5% → **0%** (a soft check-to-a-STOP,
    never negative) instead of the old +5% → −10% backspin curve. A NEGATIVE roll — the ball pulled
    BACK toward the player — comes ONLY from a backspin BUILD: **Backspin Bo** (his `clubMods`
    `rollFracDelta`, loft-scaled −0.05 → −0.10 on the scoring clubs — the ONLY golfer who spins it
    back) or **spin gear** (`backspinBoost`), added on top of the neutral base. So a plain wedge lands
    and holds predictably; backspin is a specialist's tool you choose (play Bo / buy the gear), never a
    forced lottery. Pure physics change (zero extra rng draws — `rollPotential`/`backspinRoll` still
    take one draw, `frac` just shifts), so auto ≡ interactive and the death-spiral/character-balance
    bars stay green. `hasBackspin(carry)` now means only "a wedge-loft club" (a club a spin build CAN
    check), not "this backspins". The scorecard's Backspin row + the off-green check line gate on the
    roll actually going negative (`roll < 0` / `K < 0`), so they show only for an actual spin build.
  - CARRY / ROLL SPLIT (GS-carry-rollout-split): a club's number is its **TOTAL** distance (carry + run),
    not its carry. The ball FLIES a family fraction of the total — driver **0.80**, wood 0.82, hybrid
    **0.85**, iron **0.90** (wedge/putter 1.0, land-and-hold — byte-for-byte the backspin-optin behaviour)
    — and RUNS the rest, so the player reads "land short, run to the flag" and knows the number includes
    the run (fixes "clubs just sit and stop"; the hook for future carry-boost shop items — buy carry to
    clear a hazard vs. total to go further). The split is **total-PRESERVING** and lives in `flight.ts`,
    keyed off `FlightProfile.carryFrac`: `flightScaleFor` (= `carryFrac·(1+legacyRollFraction)`) scales the
    FLIGHT `intended` down in `resolveShot`/`shotSpread`, and `rollFractionFor` (= `(1−carryFrac)/carryFrac`)
    is the run `rollPotential` releases — anchored on the pre-split roll curve so `carry + run` finishes
    exactly where the ball used to (endpoint preserved ⇒ death-spiral neutral; the main balance bars stay
    green, only forced-carry worlds get modestly harder ON PURPOSE — the ice-ring frost fence is relaxed
    with a `TODO(GS-carry-rollout-split)`). The physics roll cap is `ROLL_ENERGY_CAP` (60, above the AI's
    `MAX_ROLL` 42 allowance) so a driver's bigger run isn't clipped. The ONE fairness-critical coupling:
    a forced carry must be cleared in the AIR, so the carry-aware AI keys off **flight** reach
    (`maxFlightReachOf`/`flightCarryScale` in `carryTarget`/`longestCarryClub`), never total — it lays up
    when its reduced flight can't span the hazard (Stableford can only rise, contract 4). REACH decisions
    (green/position) still key off TOTAL (unchanged). `clubRollFraction(clubId, nominal)` is now
    family-keyed (re-exported from round.ts). Guarded by the whole suite (byte-shifts re-pinned; wedge/
    putter carryFrac 1 ⇒ backspin/putting paths byte-for-byte). No `_gs*`/URL hook (physics + a HUD
    readout), so no test-hub wiring.
  - The ROLL/CHECK helper line (GS-backspin-line + GS-runout-line + GS-carry-rollout-split) is the
    full-shot twin of the putt read: on the shot screen it draws a short cyan line from the aim-line
    touchdown to where the ball settles. A shot that actually CHECKS BACK (a backspin build's wedge,
    `K < 0`) always draws its "fly past, spin BACK" check/curl even off the green; every FORWARD-rolling
    shot draws its RUN-OUT when it lands on **short grass** (`RUNOUT_LIES` = fairway/green/tee) — so a
    drive shows its run down the fairway and an approach its release onto the green (the player SEES the
    total includes run), while a ball dropping into rough/sand/trees draws no line (little run there, and a
    line into the hay is clutter). The HUD legend shows `carry X–Yy → Zy total` so the number carries the
    run. `backspinRoll` (round.ts) is PURE: the
    MEAN roll energy (no rng draw) through the SAME `rollOut` the sim resolves, so the drawn run + curl IS
    the physics (contract 5). `previewBackspin` (play.ts) reads the character `rollFracDelta` +
    `loadout.backspinBoost` + `spinReadOf` for the read reach; it lives in the shot-cone overlay group
    (`spinPath`/`spinReadFrac`, holeView) so the pull-to-power gesture redraws it. A forward RUN-OUT is
    always shown in FULL (fundamental "where it settles" info); a BACKSPIN check stays a gear-gated read.
    The at-rest power seed (`app.ts`) also aims the CARRY so carry + run-out ≈ the pin (via
    `clubRollFraction`), so the DEFAULT approach rests at the flag instead of running past it.
    Interactive/render-only — zero sim rng, the headless auto path never reads it. Read range is a
    shoppable gear axis like the putt line: a short base reach (`DEFAULT_SPIN_READ`) always on; **Spin
    Guide Card** extends `spinReadBonus`, the **Spin Trajectory Computer** reads the whole roll
    (`spinReadFull`) — each pairs a small `backspinBoost` so the auto sim still gains (the
    Green-Reading-Book pattern; contract 4). The prefix cut is by ARC LENGTH (a straight 2-point roll
    would never show a terminus on an index cut). No new `_gs*` hook / save bump.
  - Greens layer 1–2 contour LOBES (`Hole.greenContour`, own side rng stream) over the plane;
    `greenSlopeAt` is the ONE local field the resolver, preview line, read, AND arrow field sample.
    The field math is the surface-agnostic `sim/contour.ts`; `rollOut` samples it per step and
    CURLS along it (`roll` is ARC length; straight-roll invariance holds only on lobe-less holes).
    On CONTOURED greens the FIRST BOUNCE also reads the landform (energy kick + fall-line deflect
    at touchdown) and gravity CREEP forbids resting on a steep piece of the SCULPT — creep reads
    the LOBE field only (a plane tilt still holds a ball) and never leaves the green
    (GS-green-contour-3; lobe-less holes stay byte-identical). A manual putt's `PuttLog.path`
    carries its true curved travel; auto stays pathless.
  - Contour ART is a lit relief map in the biome's own turf Shade: terraced closed-ring fills
    (`Isoline.closed`/`hiInside`), Tanaka-lit isoline chunks (fixed course-space chunk counts —
    camera-proof, machine-checked), biome-derived washes (never neutral white/black), and
    fall-line arrows contrast-picked against the turf's luminance. The relief renders on EVERY
    biome — `contoured` gates on the ISOLINES (present on every sculpted green), NOT the fall-line
    arrows (which vanish on a gentle low-`greenSlopeMax` green, the "no contour" bug). Rainbow Road
    is the one exception: it takes its own ribbon branch and draws no green contour (deliberate).
  - Harder stops tilt greens more (slope-magnitude floor rises with wildness, drawn from the SIDE
    slope rng — calm stops keep the old draw).
  - Putt-FEEL: fall-line arrows are PX-CAPPED in `styleGreen`; the putt watch-cam reuses the putt
    screen's exact framing padded for break bow (aim-INDEPENDENT); ◄/► aim is per-putt scaled with
    hold auto-repeat, and nudges update SURGICALLY (`puttAimRefresh` — a full `render()` resets the
    pace meter mid-aim).
- **Render layer** — `docs/decisions/render.md`
  - ONE pure projector (`render/project.ts`) both renderers share. ONE shared scene builder
    (`render/style.ts buildScene` → `Prim[]`); SVG = static map, Canvas2D = animated play view.
  - `style.ts` is the ORCHESTRATOR only (GS-style-split): `buildScene` keeps the seeded streams +
    their draw ORDER, the two interpreters, and the unchanged public exports; the painters live in
    per-domain `src/render/style/*` modules (shared / land / fairway / green / hazards / flora /
    ground / platforms / effects). **A new painter = a new `style/` module**, and painter modules
    never import style.ts (`shared.ts` is the dependency root — no cycles).
  - All scene randomness is mulberry32 seeded from `hashHole()` on documented streams — adding a
    draw must not perturb existing stream order. SVG clip/gradient ids are per-hole
    (`holeIdPrefix`) — document-global ids cross-clip co-mounted SVGs.
  - The scene is CAMERA-PROOF (the follow-cam rebuilds per frame): rng draw counts never read the
    projection; `posHash` keys are course-space, never screen px; `archetypeDecor` pushes its prims
    UNCONDITIONALLY. `tests/camera-stability.test.ts` guards.
  - Rough is ROUGH; space starts at the OB frame: the land hull fills `playBounds`+apron with the
    world's rough palette; every archetype's `rough.base` sits ≥30/255 brightness above its space
    tone (machine-checked). The rough is the biome's ground COVERING (`GROUND_COVER` table — every
    archetype has a row EXCEPT void/cetus, machine-checked). Easter-egg props (`EGGS`) hide in the
    rough on their own stream, off-corridor, camera-proof; void/cetus excluded.
  - DEPTH: over the covering, `biomeRelief` (`style/relief.ts`, `BIOME_RELIEF` table — EVERY
    archetype has a row, machine-checked) lays directionally-lit relief mounds so the ground reads as
    ROLLING terrain, not a flat slab (GS-biome-relief). Paired hi/lo lobes offset along `LIGHT_UL`
    (a lit crest + an offset shaded hollow = a rise with volume; a lone bright blob is the "spotlight"
    bug); tints are per-world (dunes/snow drifts/scorched swells/cosmic rises/gilded rolls), never
    neutral. PURE geometry (ZERO rng — `posHash` variety only) → perturbs no seeded stream (contract
    1) and the mound count is a function of the COURSE-space land bbox, never the projection
    (camera-proof). Clipped to the land/lost-platforms and drawn UNDER the mown turf (undulation lives
    in the rough); Rainbow Road rides its own `RAINBOW_RELIEF` sheen ON the ribbon. Rides `art.texture`
    (no new `_gs*` hook). Re-shoot the gallery after touching it.
  - Platforms + hazard families merge through `render/merge.ts`: platforms are
    `dilateUnion(…, 14)` (never a mitred `offsetPoly` outset — it folds at concave bends);
    sand/liquid families draw NEAR-body-CLOSED bodies (`unionClose`, course-space, WeakMap-cached,
    GS-hazard-merge). Where `unionPolys` fuses only bodies that already TOUCH, `unionClose` also bridges
    hazards within a `gap` (`HAZARD_MERGE_GAP` = sand 14 / water 11 / lava 11 yd) by dropping a slim neck
    quad between each near pair — so a cluster of bunkers or a lake+pond reads as ONE organic complex with
    a pinched waist, not a manky pile of individual stickers. Bodies keep their exact size (only a neck is
    added → graphic ≈ physics); a lone hazard is untouched. Render-only, zero rng — sim penalty polys
    (fairness/carry/aim) are unchanged, so no balance impact.
  - A crossing river/lava flow/crevice's DRAWN bank is roughened so it reads as a natural hazard,
    not a uniform band-aid (GS-hazard-edges, `roughenHazardEdge`): course-space, `posHash`-derived,
    MEAN-ZERO about the true edge + amplitude-capped (≤40% of the body's narrow span) → RENDER-ONLY,
    the sim penalty poly (fairness/carry/aim-cone) is untouched and the graphic still tracks physics.
    WATER meanders in smooth curves, LAVA cracks into jagged crust, a CREVICE cracks hardest.
    ZERO rng (byte-stable streams), camera-proof, WeakMap-cached per body.
  - The water LIQUID palette is per-WORLD via `waterLiqFor(arch)` (GS-toxic-pools): the Toxic Mire
    (swamp) draws GLOWING neon-green/teal ACID pools (`TOXIC_LIQ` — caustic acid-lime shore, neon body,
    luminous teal core, + an emissive `glow` halo the liquid family paints UNDER each body), every
    other world keeps the classic blue `WATER_LIQ`; lava stays per-KIND (`LAVA_LIQ`). RENDER-ONLY —
    the sim still plays these as ordinary `water` penalty (fairness/carry untouched), and the `glow`
    prim is fixed/zero-rng so `styleLiquidFamily` draws the same flow/glint stream (feature-off worlds
    byte-identical). `spawnLandFX` throws a matching neon acid splash on swamp. A new luminous liquid =
    a `LiquidPalette` with `glow` + a `waterLiqFor` row.
  - The BUNKER palette is per-WORLD via `sandLookFor(arch)` (GS-rusted-bunkers), the sand twin of
    `waterLiqFor`: the Scrap Belt (metal) digs flaky orange-RUST pits (`RUST_SAND` — no pale beach
    tan, dark corroded rake grooves) so the hazard fits the corroded machine graveyard; every other
    world keeps ordinary `SAND`. Its firm `waste` SCATTER flats reskin to brushed grey-STEEL plates
    (a `scatterLook` metal-waste case), and the rough/background carry grey steel too (`GROUND_COVER.
    metal.steel` mottle patches + a steel grain fleck + a bare-steel shard, and grey plates/debris in
    `styleFlora` metal) so the rust reads broken up by a cool third colour beside the MUTED-verdigris
    fairway (`ARCHETYPE_TURF.metal` — a greyed patina teal, not a vibrant lime). ALL render-only, zero
    rng (colour swaps + posHash-picked steel), so the sim plays these as ordinary sand/waste lies and
    every non-metal world is byte-identical. `spawnLandFX` throws a rust-flake puff on metal. A new
    world bunker skin = a `SandPalette` + a `sandLookFor` row.
  - Carved features share ONE light (`LIGHT_UL` → `insetEmboss`/`embossChildren`). NO drop shadow
    onto turf (reads as floating); the depression is a THIN lip capped by body radius; the green is
    FLUSH with the fairway. Its OUTWARD fringe/collar apron rings (`styleGreenSurround`) draw UNDER
    the fairway pass, so they ease the green into the ROUGH and never paint over the corridor (the
    apron-over-fairway bug). `deeprough`/`fescue` blobs are per-ARCHETYPE (`DEEP_ROUGH` has a row for
    every world incl. void/cetus; fescue derives its body/tufts from `turfShade('rough', arch)`) — the
    GS-rough-gradient pass pours them onto every world, so neither may hardcode one world's palette.
    Hazards get a soft grassy margin blended toward the hazard (never
    darker than turf); internals deepen through smooth feathered ramps, not hard bands. The fairway
    takes a first-cut `collar` + a FEATHERED cut grade + edge-ease strokes + two-band sheen on
    parkland worlds only (void/cetus pass NO collar; edge bands are clipped STROKES, never deep
    `offsetPoly` insets — those fold on a thin ribbon). All pure geometry, zero rng
    (GS-fairway-2).
  - Turf bases still emit `#3f8c3f`/`#5fd45a` (the holeView fill test).
  - The aim-cone overlay is SCALE-HONEST: every layout decision reads the projector's px-per-yard;
    blocked-zone shading probes the sim's OWN flight walks — never fork them, never hard-code px
    into the sim. A line is shaded BINARY (clear, or blocked from the object to the cone's far
    edge). The blocked-zone glyph is keyed to the WORLD archetype (`TREE_GLYPH` mirrors
    `styleFlora`); tents stay ⛺. The cone's near/far ARCS are `shotSpread`'s `[low, high]` = exactly
    `resolveShot`'s UN-shifted carry clamp; wind rides ONLY `expectedCarry` (the aim line), INSIDE the
    cone — never add the wind term to the arcs (it draws a window the shot can't reach; invisible at
    full power, wildly wrong at chip power — the "arc too long/short around the green" bug).
  - The pull-to-power gesture redraws ONLY the spray-cone group (`#gs-shot-overlay` via
    `renderShotOverlaySVG` / `shotConeParts`) + the power/legend HUD spans in place, NEVER a full
    `render()` per drag frame — a full render rebuilds the whole `buildScene` (flora, rough gradient,
    contour art) and lagged hard on close chips/putts. Focus/follow mode only (stable projector);
    whole-hole fit mode falls back to `scheduleRender`. The sibling of the #281 putt-overlay swap.
  - The PUTTS-ONLY watch-cam holds a STATIC frame (`follow: hadShots` in the animation mount — off for
    a green putt), centred on the ball↔cup midpoint at `puttViewRadius` exactly like the putt aim
    screen. The follow-cam rebuilds the projector every frame, which defeats playView's `cachedProj`
    scene cache and re-ran the whole heavy `buildScene` 60×/sec — the putt-watch chug (worst on
    frost/ice greens). A putt's whole span is already framed, so no follow is needed and the scene
    builds ONCE (verified 19→1 on a short putt; larger on a long one). Shots still follow the ball in
    flight. (GS-putt-watch-lag.)
  - Per-world identity is table+dispatch, never a fork: flora, OB markers, signature decor, ambient
    air, wind tint are ALL archetype-keyed (`tests/biome-identity.test.ts` guards full coverage); a
    flora variant must consume EXACTLY the classic two rng draws (extra variation via `posHash`).
  - The weather layer's pinned starfield masks off `landPolysCourseFor`; meteor strikes re-burn
    EXISTING scorch marks fed by the play view's LIVE projector (never the aim overlay's).
  - The Cetus star-waterfall MOVES in the Canvas2D play view (GS-cetus-flow, `render/cetusFlow.ts`):
    the play view sets `SceneOpts.animateCetus` to suppress the static `cetusRiver` and instead draws
    a live flow over the scene — stars drift source→spill, curtain streaks fall, the splash churns —
    on the SAME course-space channel `cetusRiverPath` emits. Motion rides the SHARED WALL clock
    (GS-decor-view-states), ZERO rng, so `animateCetus`-off (SVG map + tests) is byte-identical;
    PERF-neutral (geometry cached at mount, per-frame = re-project a short polyline + ~90 capped particles,
    NO `buildScene` rebuild — it replaces the equal static river the follow-cam rebuilt). Speed rides
    `_gsFeel.cetusFlowSpeed`. The WATERFALL tips to the EDGE (GS-cetus-waterfall-angle,
    `waterfallBasis` in `style/platforms.ts`, shared by BOTH the animated flow AND the static
    `cetusRiver`): the curtain used to always drop straight screen-DOWN, so a rotated follow-cam sat a
    flat horizontal lip across a river arriving on a slant. Now the lip + curtain lean along the river's
    own PROJECTED downstream tangent at the spill, so they line up with the plateau edge — clamped to
    ≤~34° off straight-down (never sideways/up, always reads as a gravity drop) and byte-for-byte
    straight-down when the river arrives vertically (the perfectly-aligned case). Pure geometry, zero rng.
  - DECOR IS VIEW-STATE-INVARIANT (GS-decor-view-states): the four gameplay views (aim / watch / chip /
    putt) draw the animated decor through DIFFERENT projectors on DIFFERENT canvases, so any element that
    is a pure function of `(worldPosition, wallClock)` reads IDENTICALLY in all four and never jumps on a
    view switch — the projector just reframes it WITH the world. Two rules make that hold: (a) world decor
    (Cetus river, ship junk + hull sections, meteor craters) is COURSE-anchored — projected + `proj.scale`-
    sized each frame, NEVER screen-fraction anchored (`fx*W`, `sizeFrac*min(W,H)`); (b) ALL ambient decor
    rides the SHARED WALL clock (`performance.now()` / the raw rAF timestamp — `playFx.ts`'s overlay AND
    `playView.ts`'s watch), NOT the slo-mo virtual `vnow` (which stays for the ball/caddy/shake cinematic
    only) — a per-mount clock that reset to 0 made the whole sky/river/junk teleport at the aim→watch cut.
    Weather is screen-space SKY (viewport-anchored, at infinity) but continuous via the shared clock + the
    two play canvases being the SAME full-bleed size. GUARDED: `tests/decor-consistency.test.ts` proves the
    ship-drift MODEL is course-space + holds no screen-space fields; `tests/build.test.ts`'s headless-
    Chromium `window.__gsDecorProbe` pans the camera and asserts the decor centroid moves WITH the world
    (world-anchored), not against it. A new animated decor twin obeys BOTH rules or it will jump.
  - AIM-OVERLAY DECOR (GS-overlay-decor): the animated world-decor twins (Cetus flow, derelict ship
    drift) AND meteor STRIKES used to move only while WATCHING a shot — on the static aim/putt screen
    the river/junk/craters sat frozen. `mountWeatherOverlay` (`app/playFx.ts`) now draws them over the
    aim/putt map too, through a `alignedProjector` that composes the SVG map's OWN projector with the
    CSS meet-fit letterbox transform, so the decor lines up pixel-for-pixel with the map beneath. Only
    in FOCUS/FOLLOW mode (armed via `overlayDecor` in `app.ts`); whole-hole fit folds `extra` points the
    overlay can't reproduce, so it stays static there. The Cetus river draws in `overlayOnly` mode (skips
    the opaque channel BED — the SVG's static river IS the bed, so the ball marker + aim cone stay
    readable under only the moving motes/waterfall). `drift` is OFF on the putt screen + the putts-only
    green watch (`ambientDrift`): the tight ~25-yd zoom floated the ship SECTIONS weirdly over the cup.
    Browser-only side layer (never the sim); no new hook (reuses `_gsFeel.cetus/shipDriftSpeed`).
  - The decision map's framing holds still for the whole shot decision; the shot animation starts
    at the decision map's exact `decisionRadius`. `playView`'s `spawnLandFX` answers the touchdown
    per lie/penalty — extend it with any new penalty kind.
  - Re-shoot the gallery (`node scripts/gallery.mjs`) after any `style.ts` / `style/*` change.
  - Shop/reward CLUB cards draw a per-FAMILY head (GS-club-icons, `render/itemArt.ts`): `clubFamilyOf`
    → `clubHead` (driver/wood/hybrid/iron/wedge/putter), shaft + head share ONE `HOSEL` anchor so the
    shaft meets the HEEL (centre = the old shovel look). Gear-shaft items resolve via `SHAFT_FAMILY`,
    reward clubs off their `<type>`; `itemArtKind` stays `'shaft'` (per-id emblems keep them distinct).
    Pure SVG, no rng/save bump. Eyeball with `scripts/club-icons-preview.mjs`.
- **Audio** — `docs/decisions/audio.md`
  - ASSETLESS, always: every cue + music note is synthesized WebAudio — no downloaded audio file,
    ever. ONE shared `AudioContext`, two buses: SFX on `sound`, generative music on `music`.
  - Strikes are voiced per club FAMILY (`strikeClassOf` — beware `PW/GW/SW` end in 'W' but are
    wedges); touchdowns per SURFACE + tree hits per ARCHETYPE (coverage machine-checked). A hazard
    with its OWN surface voice does NOT also play `sfx.penalty` (that stays for SURFACELESS
    penalties). A safe-landing-then-abyss-roll fires its lost FX at REST, not on the landing.
  - Music is table+dispatch per archetype (`MUSIC_TRACKS` + `'menu'`; coverage + gain ≤0.35
    machine-checked) on a PRIVATE seeded stream. The sim never calls audio; audio modules must
    import clean in node. Worlds are made AUDIBLY DISTINCT (GS-music-distinct) — not just re-tuned —
    by per-row TIMBRE levers the engine renders (all optional, absent = the old plain voice): `lead`
    (the melodic voice's CHARACTER: pluck/bell/marimba/bowed/blip — the biggest cue), `padDetune`
    (chorus width), `padCut` (a low-pass that DARKENS the pad — the strongest bright-vs-murky cue),
    `sub` (a deep drone for weight), `pulse`/`pulseVoice` (a subtle percussion groove: kick/clank/
    heart/shaker/tick on the driving worlds). Guarded that the table stays genuinely varied (≥4 leads,
    ≥6 grooved, ≥4 darkened) so it can't collapse back to one voice.
  - WEATHER AMBIENCE (GS-weather-audio, `render/weatherAudio.ts`) — a subtle environmental sound bed
    that COMPLEMENTS the music, keyed to the route's `CourseEffect` (content-as-data, coverage
    machine-checked): a blizzard howls, a storm crackles, an aurora shimmers, a gravity well rumbles.
    One `WEATHER_AMBIENCE` row per effect = a continuous bed (wind/drone/shimmer, gusting on an LFO) +
    a sparse event pump (crackle/sparkle/twinkle/whoosh/clank). Its OWN low-gain bus off the shared
    context; gated on `sound` (environmental SFX, independent of `music`); DELIBERATELY subtle —
    capped at `WEATHER_GAIN_CAP` (0.16), well under the music bed, so it never overpowers the melody.
    Driven from `syncMusic()` (only while a golf hole is on screen; silent on menu/travel/shop). A new
    sky's sound = a row. `_gsFeel.weatherVolume` scales it (a sub-field, no test-hub wiring).
- **UI layer** — `docs/decisions/ui-intro.md`
  - The screen flow is a PURE reducer (`ui/game.ts`): `(UiState, Action) → UiState`, no DOM/time,
    fully unit-tested. `app.ts`/`main.ts` render state + dispatch; save persistence + canvas mounts
    + the intro cinematic are side-effects there, never in the reducer. `game.ts` is the re-export
    BARREL + the `reduce` switch (GS-refactor-split): the state/action TYPES live in `gameState.ts`,
    the per-golfer cosmetic resolvers in `gameCosmetics.ts`, and the shared run-end/endless/ace/Asgard
    UPDATE helpers in `gameUpdates.ts` (siblings never import game.ts — no cycle). Extend a sibling,
    not the barrel; every `import … from '../ui/game'` still resolves through the re-exports.
  - The app shell is SPLIT (GS-app-split): `app.ts` keeps boot/dispatch/render wiring + the
    interactive play screen; every other screen builder lives in `src/app/*` (title/intro/result/
    shop/market/clubhouse/travel + `ctx.ts` with the live `state` binding, `duelHud`, `helpers`).
    Screen modules read `state` from `ctx.ts` and NEVER dispatch or import app.ts (no cycles);
    per-screen view state is an exported view object (`marketView`, `introView`, …) app.ts's
    wiring mutates. A new screen = a new `src/app/` module, not more app.ts.
  - Visual theme is the design-token CSS in `index.html`, not the SVG layer. The play screen is
    full-bleed and never scrolls; pull-to-power is the only shot input.
  - DEFAULT AIM is a smart assist (GS-default-aim): `selAim` seeds from the persisted `Settings.aimMode`
    each new shot (default `'auto'`), resolved by the SHARED `aimTargetOf` in `play.ts` (so `previewShot`/
    `takeShot`/auto-finish stay byte-identical, contract 2). `'auto'` = the pure `round.ts autoAimTarget`:
    par 3 → the flag; par 4/5 TEE → down the fairway CENTRELINE (dogleg-aware station at ~drive reach, not
    a straight line that cuts the corner into rough); par 4/5 NON-tee → the flag when the green's reachable,
    else position down the corridor. Forced carries defer to `safeTarget` (clamped ≤ reach). `'attack'`
    (flag) + `'safe'` (`layupTarget` corridor lay-up) are the old modes. INTERACTIVE-only — the headless
    `playHole` keeps its own `layupTarget` line, so determinism (contract 1) + every seeded test are
    untouched. Change it in play via the ◎ club-row button (cycles auto→attack→safe, persists) or the
    settings-sheet 🎯 pill; the default club seeds to the mode's fit (`ShotView.autoClubId`). A free-drag
    aim still overrides for that shot. `aimMode` is a `Settings` field (no save bump, no `_gs*`/URL hook →
    no test-hub wiring). Guarded by `tests/default-aim.test.ts`. THREE follow-up fixes: (1) the shot map
    now ORIENTS down the resolved aim line — `decisionView`'s `up` = `resolveAimTarget(…)` − ball, not the
    hardcoded tee→PIN — so the framing AGREES with the default aim and reorients when the mode / free-drag
    aim changes (the old pin-up pointed across a dogleg corner into the trees while the auto aim went down
    the fairway). (2) the default CLUB is `round.ts autoAimClub` (NOT the auto sim's club-DOWN `aiClub`),
    kept in lockstep with `autoAimTarget`: a green attack → the green-COVERAGE club (`suggestPlayerClub`,
    so an approach never comes up a club short); an OPEN corridor positioning shot → the LONGEST usable
    club (the driver off the tee, since the club sets the CARRY and the aim only the DIRECTION — it was
    pre-arming a 5-wood); a forced-CARRY drive (the aim flies OVER a hazard to a landing beyond it) →
    `longestCarryClub`, the LONGEST club that still clears the far bank AND lands penalty-free (more club
    is the safer carry, not less — a long par-4 tee shot over a river is a DRIVER, not a clubbed-down
    wood), stepping down only if the driver can't clear / would overshoot into a second hazard, and
    falling back to `aiClub` only when NO club clears (a genuine lay-up short). This fixed the residual
    "off-tee still defaults to a 5-wood on a carry hole" report: the old blocked-line branch handed the
    forced carry straight to `aiClub` (shortest club that reaches), clubbing a driver down to a wood on
    the ~58% of long par-4 tee shots that carry a creek/river; it also cured the sticky sibling symptom
    (auto pre-armed the wood, then toggling aim to pin KEEPS the selection since it's still usable — so
    an attack shot showed the wood too). (3) the
    settings 🎯 dropdown was UNPICKABLE — a click on the `<select>` bubbled through the `[data-settings=
    "keep"]` branch (which `return`ed WITHOUT `stopPropagation`) to the backdrop's close handler, tearing
    the sheet down before you could choose; the keep branch now stops the event.
  - The settings cog rides EVERY screen (appended once in `render()`); "Return to title" is
    NON-destructive (an underway run parks as `resumable`). `persist()` snapshots the live run only
    when one is underway, else passes `state.resumable` through — NEVER snapshot the title's
    character-less placeholder run (it wipes saves).
  - The settings SHEET's inner content is `settingsSheetInner()` (split from the `settingsOverlay`
    backdrop/frame wrapper); an in-sheet toggle/aim tap updates it SURGICALLY via `refreshSettings()`
    (swap `.gs-settings` innerHTML + re-`wireSettingsSheet(sheet)`) — NOT a full `render()`, which
    re-mounts the `.gs-sheet` frame and replays its slide-up animation as a flicker (GS-settings-flicker,
    the `puttAimRefresh` sibling). A Music toggle still calls `syncMusic()` in the handler (render() no
    longer runs to do it). `wireSettingsSheet(root)` wires the sheet's descendants only, so the
    persistent backdrop + frame are never double-listened. The Audio + Feel on/off prefs are compact icon
    CHIPS (GS-settings-chips, `.gs-setchip` in a 2-col `.gs-chipgrid`, `TOGGLE_CHIPS` table) — icon +
    label + a mini switch, descriptions on `title`/`aria-label` — replacing the tall full-width rows so
    the sheet is far shorter; aim stays the segmented `.gs-seg` control.
  - The title's CONTINUE RUN button (GS-continue-button, `titleScreens.ts continueRunHTML`/`resumeInfo`)
    is THEMATIC + mode-aware: the character's cosmetic ship (`shipForCharacter`→`shipCardSVG`) + a message
    read off the parked `RunSnapshot` — Voyage → `Arc N of 3` (`arcIndexOf(stopIndex)+1`), Unending →
    `Hole N` (`holesSurvived+1`), Star Tour → a course medallion (`courseIconHTML`, archetype-tinted
    planet+flag) + course name + `Hole N of 18`. Star Tour ONLY offers a continue once a course is teed
    off (`staticCourseId` set) — a golfer-picked-but-no-course session shows no card. OWN class prefix
    `.gs-resume*` (never the play HUD's `.gs-hud`). Pure render off `state.resumable`; no `_gs*`/URL hook.
  - STAR TOUR mid-round resume (GS-star-tour-resume): the 18 holes are ONE stop, so the ordinary
    restart-the-stop resume would bin a parked round. The snapshot now carries the live round progress
    (`RunSnapshot.stopHoleIndex` + `stopPlayed`, captured in `persist`/`toTitle` from `state.play`/
    `stopPlayed`, save **v29**); the reducer's `resume` restores the scorecard + tees up that hole (screen
    `playing`, no lore gate) so you continue where you left off. `holeRng` reseeds fresh — a records chase
    isn't determinism-guarded, so resumed holes just draw a new dispersion stream, no played score re-rolls.
    STROKEPLAY-only (the fields are absent on every other format → byte-for-byte the old restart resume).
  - Character select fits ONE mobile screen with NO scroll (GS-select-onescreen): the roster is a
    self-contained `.gs-select` flex column inside a viewport-LOCKED page frame (`.gs-main--fit` →
    `height:100dvh;overflow:hidden` on phones, app.ts `fit` flag). The header + difficulty pills sit at
    natural height and the `.gs-charwrap` grid (`repeat(2,1fr)` phones / `repeat(4,1fr)` desktop,
    `grid-auto-rows:1fr`) FILLS the rest — so adding future golfers REFLOWS into more rows that share
    the height, never off-screen (no per-count redesign). Each card is a flex column whose ONE soft
    region is the unlocked-clubs strip (`.gs-charcard-unlocks`): it flex-GROWS to fill spare height and
    is the ONLY thing that clips on a short card — portrait/stats/hint never clip. On PHONES the footer
    CTA (`.gs-charcard-cta`) is HIDDEN (`display:none`) — the whole card is the button (an `aria-label`
    carries the action) — because it sat over the club chips and read as a scrollable footer that
    instead selected the golfer; desktop keeps the CTA. No mask-fade (a bottom fade reads as
    "scrollable"). The two difficulty pills share one row on phones (`flex:1` in `.gs-diffrow`, value
    truncates). Guarded by a browser no-scroll assertion + `?screen=character` deep-link in
    `tests/build.test.ts`. Ascension is picked WITH the golfer, never on the title, defaulting to your
    LAST pick
    (`Settings.lastAscension`). Difficulty is TWO native-select DROPDOWN pills on one compact row
    (GS-diffpills, `.gs-selpill` / `[data-selasc]` + `[data-selclubset]`): ⚔ Ascension (voyage, when
    tiers are unlocked) + 🎒 Club set / bag — the club-set pill shows on EVERY mode now (only when a
    better-than-common bag is owned) so a per-run bag downgrade is one tap from any format. The pills
    are view state (reducer-clamped); the club-set pick overrides + write-throughs only when CHANGED.
    Each VOYAGE card's club-UNLOCK badge names that golfer's OWN easiest unlock tier (GS-ascension-clubs
    display, off `maxAscensionByCharacter`): the mechanic (`runEndUpdates`) grants a club on a win at
    Ascension `>= maxAscensionByCharacter[id]`, so the LOWEST uncleared tier `A{cleared}` is the easiest
    unlock — and the badge ALWAYS names `A{cleared}` (INDEPENDENT per golfer; they read "all over the
    place" by design). NOT the globally-selected difficulty (the fixed bug: it printed `A{sel}`, telling
    you to grind A8 when this golfer unlocks at A1). The selected difficulty only tints it: 🔓 green "Win
    A{cleared} → new club" when `sel ≥ cleared` (a win at your current pick unlocks), 🔒 "Next club: win
    A{cleared}" when `sel < cleared` (raise the difficulty), ★ "Bag complete" when full. The whole card
    is the button. GS-select-layout.
  - The stop intro is TWO mobile steps on one reducer screen (`'intro'` + view state `introStage`);
    `introShared()` derives world/notes/objective ONCE so the steps never drift. Past stop 0 EVERY
    format opens on the `'hole'` step (map + Tee Off), so a route jump lands one tap from teeing off
    instead of on a briefing/leaderboard the player just saw (GS-intro-endless for the Unending
    Universe, GS-intro-voyage for the Voyage); the briefing stays one `‹ Briefing` tap away. Stop 0
    (from character select) keeps the `'arc'` step — it's the mode lobby with `Change golfer`.
  - The post-stop recap (`resultScreen`) is a pure render off `state` — rarity-framed panel, stat
    tiles, clickable hole-by-hole strip.
  - The title is a hero wordmark + THREE GAME tiles (GS-star-tour) reusing the doorway component
    (`.gs-navtile--game`; whole tile = the button, distinct only via the `--mc` accent — never
    regrow badges/launch bars/progress text) in a 3-across row (`.gs-navtiles--games`), over the two
    Trade-Market/Clubhouse doorways (2-up `.gs-navtiles`). Voyage + Unending are auto-listed from
    `FORMATS`; Star Tour is a BESPOKE tile (`openStarTour`, not the generic `start`) because it opens
    its own course-picker star map first — so `strokeplay` is EXCLUDED from the auto-list.
  - STAR TOUR star map (GS-star-tour / GS-star-tour-2, `app/starTourScreens.ts` + `render/starTourMap.ts`):
    a full-bleed, free-roam celestial chart — every course plotted at its constellation's real J2000 sky
    position (`THEME_SKY`) over a deep-space backdrop (seeded nebula washes + a Milky-Way band + tinted/
    hero stars, all mulberry32-seeded, never Math.random). The viewport is `touch-action:none` and drives
    BOTH gestures itself (`wireStarTourGestures`): one finger PANS (scroll), two fingers PINCH-ZOOM about
    their midpoint (`starTourView.zoom`, the SVG's px width/height scale while the viewBox stays fixed, so
    ship/world chart-coords are unchanged — only scroll conversions multiply by zoom; ⌘/Ctrl+wheel zooms on
    desktop). This SUPERSEDED the old native-scroll `wireStarTourDrag`, whose second finger jittered into
    the drag handler (the pinch "flicker jump" bug, no zoom at all). A moved drag/pinch sets
    `starTourDragged` so the trailing click doesn't fly; the tap handler must NOT `setPointerCapture` (it
    retargets the click off the world `<g>`, degrading every world-tap to a free flight). CHARACTER SELECT
    COMES FIRST
    (GS-star-tour-2): `openStarTour` opens the roster, `selectCharacter` (strokeplay branch) then lands on
    the map, so the run carries the golfer and the map flies THEIR cosmetic ship (`shipForCharacter` →
    `shipSVG`). You FLY the ship: a TAP orients + cruises it there (an app-layer rAF loop in `stepStarTour`
    moving `starTourView.shipX/Y/heading`, chase-cam following, scroll preserved across renders via
    `starTourView.scrollX/Y`). The chase-cam eases the scroll to keep the ship centred while
    `starTourView.following` is set — armed by any fly*, cleared the instant the player takes manual control
    (pan/pinch/wheel) — NOT the per-frame `cruising` flag (GS-star-map-jerky-movement): gating on `cruising`
    hard-FROZE the map off-centre the moment a hop reached its target, so rapid "tap to keep moving" taps
    stuttered freeze→lurch between hops. Following keeps the ease running across those gaps (converging to a
    no-op once the ship is idle+centred, so it never fights a resting/panned view). The ship art faces +x, so heading = `atan2(dy,dx)` (0 = flying right) —
    NOT the old `atan2(dx,−dy)` 0=up heading fed into a right-facing hull, which rendered a downward flight
    upside-down. A LEFTWARD flight mirrors the hull vertically (`starTourView.flip` = −1, decided at launch
    off the target side, held for the whole flight so it never snaps mid-cruise) so a wheeled/keeled craft
    keeps its top up; docked heading is nose-UP (`SHIP_DOCK_HEADING` = −90). FLIGHT ORIENTATION IS PER-SHIP
    (GS-ship-fly-orient, `ShipLook.fly`): the nose-along-heading rule above is `'nose'` (the default — every
    car/cruiser has a front + tail exhaust). A nose-LESS HOVER craft (`'hover'` — the flying-saucer Little
    Green Caddie + the Mothership, and any future disc/orb ship that isn't a vehicle shape) must NOT rotate to
    the heading — that tumbled the disc and swung its downward under-beam out the side ("flames out the side,
    moving sideways"). Instead the `#gs-st-ship` group carries POSITION only and splits into two oriented
    children: `#gs-st-body` (the hull — NOSE → `rotate(heading) scale(1 flip)`; HOVER → stays UPRIGHT and only
    `hoverBank(heading)` = `HOVER_BANK_MAX·cos(heading)`, a gentle lean into travel that never tumbles) and
    `#gs-st-thrust-orient` (the plume — ALWAYS `rotate(heading)` so it streams BEHIND the hull whatever the
    body does). Both `shipGroup` (initial paint) AND the app's per-frame `stepStarTour` write the same split
    (branch on `starTourShipHovers()`); a new hover ship is just `fly: 'hover'` on its row. A hover craft
    also gets a BESPOKE PROPULSION (GS-ship-hover-prop, `hoverThrust`) instead of the car jet: a downward
    ANTI-GRAV REPULSOR (pulse rings rippling down-and-out + a plasma pad hugging the disc base + a flickering
    ion column + falling charge motes, coloured off the ship's flame/accent) drawn UNDER the hull in the
    body-local frame (so it banks with the disc + always points down, never a sideways tail flame); its
    `#gs-st-thrust-orient` jet group is left EMPTY. Wears `.gs-st-thrust` so the `.gs-st-thrusting` cruise
    fade powers it up (docked = the disc rests on its pad) + `.gs-st-hoverprop` as the marker. An engine PLUME
    (`thrustTrail`, trailing off the tail, coloured off the ship's flame/accent) fades in via a
    `.gs-st-thrusting` class the rAF loop toggles while cruising, so the ship reads as flying, not sliding.
    FLIGHT SPEED
    (GS-star-tour-map-improvements) is a near-CONSTANT flat cruise (`STAR_TOUR_BASE_STEP` 5.25 × the flown
    ship's RARITY via `starTourShipSpeedMult` — common .9 / rare 1 / epic 1.1 / legendary 1.2 / mythic 1.3),
    NOT the old `d*0.14` that rocketed distant hops off way too fast; only a haul with more than
    `STAR_TOUR_LONG_HAUL` (750) chart units still to go earns a gentle acceleration (`*0.0375`) on top, so
    short/medium flights stay deliberate on the small map. Base + accel were both dialled down 25% (7→5.25,
    .05→.0375) for a calmer, more readable cruise — the reduction rides EVERY rarity uniformly (the mult is
    applied on top). Tapping a WORLD flies to it
    and OPENS its DOSSIER on arrival (flavour, tier,
    record, WEATHER picker, Fly-here-&-play → `pickStarTourCourse` pins the course on the golfer's run →
    `intro`). Ship starts docked at the clubhouse `SPACEPORT` (the view opens centred there, slightly more
    zoomed OUT than intrinsic — `ST_OPEN_ZOOM`). The SPACEPORT is the map's way OUT (GS-star-tour-port): it's
    a TAPPABLE station (`data-startour-port`, drawn as a proper docking port with gantries/pads + a "DOCK ·
    CLUBHOUSE" hint) — flying home to it DOCKS the ship (`flyStarTourToPort` → `dockingAtPort`, arrival
    dispatches `openClubhouseHall`) and opens the Clubhouse; the Clubhouse hall's "🚀 Depart to Star Tour"
    button (`openStarTour`, now reachable from `clubhouseHall`) flies you back out — the spaceport ↔ clubhouse
    loop. The cockpit HUD REUSES the journey bridge HUD
    (GS-star-tour-hud, `stHud`): the star map renders a `.gs-bhud gs-bhud--st gs-bhud--<variant>` frame
    piped `hudThemeForShip`/`hudThemeVars` + `hudChromeFor`, so it recolours to the flown ship AND inherits
    the identical fleet ornaments (title plate = ship name, rails, nodes, wings, deck) — a themed bridge is
    a table row (`render/hudTheme.ts`), never a Star-Tour edit. The `.gs-bhud--st` context modifier swaps
    the travel controls for Star Tour's own. Star Tour has NO bank/run, so the CONSOLE (GS-star-tour-fuel)
    carries NO exit switch and NO big golfer name plate (they crowded/obscured the dashboard): the RECORDS
    board is baked into the top-left "✦ STAR TOUR · 🏆 n/N" id-pod LINK (`data-startour-records`, toggles
    the board), and the bottom console is the ship's DASHBOARD — a compact pilot-swap DOT (left slot,
    `openStarTour` → change golfer; a recap "Star map" KEEPS the golfer), the themed instrument DECK
    (widened to the focus now the centre is compact), a NORMAL/FAST SPEED control in the focal CENTRE slot
    (`data-startour-speed`, a throttle reading `--hud-*` so each ship's control is its livery colour), and
    the live FUEL gauge RIGHT. Leaving the map is the settings-cog "Return to title". Star-Tour CONTENT
    keeps the `.gs-sthud__` prefix; the FRAME/theme/ornaments are the shared `.gs-bhud` (this SUPERSEDED the
    old standalone cyan `.gs-sthud` chrome). The class-collision guard is
    unchanged: never `.gs-hud` (the play screen's), which the `tests/build.test.ts` play-HUD test proves.
    `intro` is Star-Tour-branched (objective/field, Watch
    hidden so a record is EARNED); the round resolves to `strokeResult` (`app/strokeResultScreens.ts`).
    The in-round HUD shows STROKE scoring (running to-par + gross), not the Stableford-vs-cut chip.
    Reducer: `openStarTour`/`pickStarTourCourse`/`exitStarTour` + `resolveStrokePlay` (banks the record
    like Asgard resolves its tournament). Deep-linkable via `?screen=startour`/`?screen=strokeresult`
    (GS-screen-deeplink, real reducer transitions); guarded by `tests/startour-flow.test.ts` +
    `tests/build.test.ts` browser smoke. Star Tour never consumes the parked Voyage/Unending resume.
    NO run economy: Star Tour is a records chase with no credits/handicap/stop/distance/scoring-fuel — so
    `header()` (the between-hole recap) is `STROKEPLAY_FORMAT`-branched to show the course + running to-par
    instead of the voyage stat rail, and the recap board shows `strokePlayProgressHTML` (running scorecard),
    never the ghost competitor leaderboard. The star map's own FUEL (GS-star-tour-fuel) is a pure MAP-
    EXPLORATION feel mechanic, NOT run economy: it lives ONLY in `starTourView` (app layer — never the sim,
    a save, or the round), so records stay comparable. Flying burns fuel by DISTANCE (so the target holds
    regardless of speed): FAST cruises +25% and burns 1.5× the fuel/distance of NORMAL, sized so a FAST
    cruise empties over 3/4 of the chart width (NORMAL lasts 1.5× further). Coming to REST at any station (a
    world / Earth / the spaceport, within `ST_REFUEL_STATION_R`) tops the tank to full; draining it in deep
    space stalls the ship and flies in a space TANKER (`#gs-st-fueltruck` + hose, an rAF state machine in
    `stepStarTour`) that hoses it up and departs, then the interrupted flight resumes. All app-layer/render
    (no reducer/save/rng, no `_gs*`/URL hook → no test-hub wiring). Re-shoot `scripts/startour-preview.mjs`. The Daily button is parked off the title for now. SHIP WEAPONS
    (GS-star-tour-weapons, `render/shipWeapons.ts`) — the console FIRE button (`data-startour-fire`) spits a
    THEMATICALLY-MATCHED projectile from the ship's nose along its heading: a scatter-gun of golf-ball buckshot
    (wagon), a railgun slug (racer), an abduction RAY (saucer), ice shards (comet), rockets (hauler), a plasma
    death-orb (mothership), twin neon lasers (bike), a forked LIGHTNING/Bifröst cannon (chopper/Pegasus), an
    aurora BLACK-HOLE nova (Infinity Ace), a phoenix fireball (Firebird). The gun is a `WEAPON_BY_KIND` row
    keyed by `look.kind` (a new ship inherits a fitting gun, no engine edit); projectiles are authored facing
    +x and driven by `stepStarTour`'s rAF loop into a `#gs-st-shots` SVG layer (the fuel-tanker/thrust
    pattern) — pure geometry + SMIL, ZERO rng. Magazine = `WEAPON_AMMO_CAP` (2) charges on `starTourView.ammo`,
    spent per fire, RELOADED wherever the tank refuels (any station arrival + the tanker top-up). Firing NEVER
    calls `render()` (that rebuilds the chart + wipes live shots) — it appends shot `<g>`s + ticks the ammo
    pips in place, exactly like the fuel gauge. All app-layer/render feel (no reducer/save/rng, no `_gs*`/URL
    hook → no test-hub wiring); guarded by `tests/ship-weapons.test.ts` (weapon/style coverage) +
    `tests/build.test.ts` (browser: fire spawns a shot + spends a charge). The star-map CONSOLE lays its five
    controls (pilot · deck · speed · fire · fuel) out IN-FLOW (flex, own space each) — NOT the travel console's
    absolute-floated deck, which the fire button crowded. DESTINATION ICONS
    (GS-star-tour-destinations → GS-star-map-icon-consistency, `render/starTourMap.ts`) — the star map is a
    DIFFERENT interface from the journey map: a course is the PLACE it's named for, not a biome skin, so
    EVERY destination is its own luminous celestial object that EMITS into the star field via `softGlow`
    (no hard tier ring, no dark halo bubble, no emoji sticker — those read as tokens on black). Each place
    is BESPOKE, in-sync, and UNIQUE from same-biome siblings via a `SIGNATURE[themeId]` row (`{kind, size,
    motif?, ring?, star?}`; fallback `signatureFor` infers off name+archetype). Three levers: (1) a
    per-destination PALETTE — a deliberate `TINT_OVERRIDE` (Orion's blue forge vs Scorpius' red, Hydra's
    toxic acid, Leo/Vela golds, Antlia/Pyxis greys) else a seeded HSL shift on the archetype base, so two
    same-biome courses never share a colour; (2) a celestial KIND, one bespoke renderer each — `galaxy`
    (grand spiral + black-hole heart, drawn LARGE so the Sagittarius Core never reads smaller than a
    planet), `rift` (torn luminous crack), `wreck` (broken starship), `ringNebula` (Lyra = the green Ring
    Nebula M57 smoke-ring), `dumbbell` (Vulpecula = the bi-lobed M27, so it's NOT a Lyra clone), `star`
    (a TAMED sun — glow restrained so no icon overpowers — flavoured `forge` [blue + Orion's Belt] or
    `sting` [red Antares + a curved stinger tail of stars]), `crown` (Corona Borealis = a jewelled arc-
    tiara), `crystal` (a three-point wedge, for Triangulum), `maelstrom` (Draco = a dense multi-arm vortex
    with a dark eye, the finished storm), `binary` (Gemini = twin icy worlds), `serpent` (Hydra = a toxic
    many-headed water-serpent coiled in acid haze), or `planet`; and (3) a per-world planet MOTIF that
    individuates the shared planet body — `mane` (Leo's golden lion mane), `companion` (Centaurus + bright
    Alpha Centauri), `whale` (Cetus breaching the star-sea), `river` (Eridanus' star-stream), `dune`
    (Vela's sail-wisp + dune bands), `scrap` (Antlia's junk belt + antenna, corroded), `foundry` (Pyxis'
    molten seams + compass needle), plus `ring` styles (ice/ocean/metal). BIGGER CANVAS (GS-star-map-
    bigger-canvas): the constellations project into a centred CONTENT box (`CONTENT_W` 2240 × `CONTENT_H`
    1456 — the old chart size, so every J2000 position is byte-for-byte where it was) wrapped in a starry
    `PAD` (`CHART_W`/`CHART_H` = content + pad; `projectSky`/`SPACEPORT_POS`/`EARTH_POS` all offset by the
    pad so the whole cluster just TRANSLATES — flight/tap/dock/fuel math unchanged), so open starry space
    surrounds the worlds to fly out into. Starfield/nebula/grid density scale with the larger area. Because
    a portrait phone zoomed all the way out still letterboxes a landscape/square chart (contain-fit), the
    `.gs-st-space` deep-space CSS backdrop (matching gradient + faint tiled stars, on BOTH `.gs-startour`
    and its viewport) fills those margins so the WHOLE screen reads as continuous starry space, never black
    bands. `EARTH_POS` plots a recognisable blue-marble HOME beside the
    `SPACEPORT`. Tier is a small luminous BEACON dot (top-left), not a ring. Everything is `mulberry32`-
    seeded off the world id (per-world clip ids via `idSafe`) — pure + byte-stable (the map has its OWN
    seeded stream, not the sim rng). Eyeball via `scripts/startour-preview.mjs`.
  - HIDDEN YGGDRASIL (GS-star-tour-yggdrasil, `render/starTourMap.ts` `yggdrasilGlyph`/`YGGDRASIL_REALMS`
    + `starTourScreens.ts` `yggdrasilSheet`): the World Tree, drawn on the chart (`YGGDRASIL_POS`, high in the
    open PAD above the constellations) ONLY once Thor's Hammer is owned (`showYggdrasil` gate → `ownedApparel`
    includes `thors-hammer`; a Hammerless chart is byte-for-byte unchanged). A tappable object
    (`data-startour-yggdrasil`) — flying to it (a fuel STATION when armed) opens the NINE REALMS overlay
    (`starTourView.yggdrasilOpen`). The realms are a `YGGDRASIL_REALMS` TABLE hung as glowing fruit on the
    tree; ASGARD (the crown, lit gold) is the ONLY `playable` one today, the other eight are BARE dashed
    sockets — placeholder rows so **a new realm is a data flip** (`playable:true` + a launcher), never a
    glyph edit. Tapping Asgard dispatches `playYggdrasilRealm` → a STANDALONE Asgard tournament
    (`startAsgardRun`, the `crossBifrost` machinery) with NO suspended journey: `asgardFromStarTour` marks it
    so `leaveAsgard` rebuilds a fresh strokeplay run and returns to the star MAP (not travel). Reducer-gated
    HARD on the Hammer + `realmId==='asgard'` (both mismatches are no-ops), so it can't fire early or on an
    unbloomed branch. App-layer/render + a reducer flow — no `_gs*`/URL hook (no test-hub wiring), no save
    bump (`asgardFromStarTour` is transient). Guarded by `tests/startour-flow.test.ts`.
  - **`app.ts` is still the hottest file (~2,200 lines: play screen + wiring) — prefer extending a
    `src/app/` module over growing it, and re-read the relevant span before editing.**
- **Intro cinematic** — `docs/decisions/ui-intro.md`. Cosmetic Canvas2D, not in the reducer;
  degrades safely (every frame in try/catch → `finish()`); the many-instance glow uses a cached
  sprite, never per-element `shadowBlur`. The real title boots first, the intro overlays it.

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

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
the NETWORK-first, subpath-scoped PWA SW above — the inverse of golf-finder's cache-first offline SW,
not a re-coupling of the two apps.)
