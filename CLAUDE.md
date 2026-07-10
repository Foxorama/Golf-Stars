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
  (localStorage is the only copy). Current schema is **v23**; bump + add a migration when you
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
  - Greens are varied STAR shapes about `green` (single-valued r(θ)) — `pinInGreen`/`rayPolyDist`/
    `validateCourse` depend on it. Pin ≠ centroid (attack aims at flag; auto/safe at fat-of-green).
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
    champion/figure).
  - SHIP CORRIDORS (GS-ship-corridor): the derelict does NOT play the void's wide, blobby survival
    islands — it plays STRAIGHT, CONSTANT-WIDTH metal HALLWAYS you shoot DOWN. Gated on `biome.walls`
    (`const ship`, the derelict is the only walls world → every other world byte-identical): (a)
    `SHIP_CORRIDOR_SCALE` (1.25, fixed — no wildness ramp, no VOID_ISLAND_SCALE) sets a tight hallway
    half-width; (b) `chooseWidthProfile`'s `ship` branch returns a `'ship-corridor'` UNIFORM profile
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
    JUNK — `render/shipDrift.ts` (the cetusFlow twin: play-view only, rides `now` + `_gsFeel.shipDriftSpeed`,
    SVG map byte-identical) tumbles torn hull-plates through the open space around the wreck.
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
    reskins the derelict's "bunkers" (bunker/pot/sand HAZARDS, union-merged via `derelictBreachesFor`) as
    ACID-ETCHED HOLES eaten through the deck to space (acid-green corrosion + a caustic etch rim + the cut
    deck thickness + a star-lit void interior) — render-only, the sim still plays them as ordinary sand
    (an awkward lie, NOT lost; the bright acid ring reads it apart from the plain-black OB). (3) the
    derelict's `waste`/`sand` SCATTER FEATURE draws as an intact riveted steel DECK PLATE (`styleShipPlates`
    in the feature loop) — a firm lie, never the default tan beach-sand patch. So the ship has NO bunkers.
  - SHIP-CORRIDOR WALLS (GS-ship-walls, `sim/walls.ts`): the derelict's corridor is lined by collidable
    METAL BULKHEADS (stamped on `hole.walls` by the generator from the SAME ribbon edges it draws, gated on
    `biome.walls` → zero rng, every other world byte-identical, skipped on island-green par 3s). They stand
    `WALL_HEIGHT` = 72 yd — ABOVE the 60-yd shot-apex cap (`ARC_FEEL.peakMax`) — so NOTHING clears them: every
    ball that leaves the deck sideways RICOCHETS back onto the corridor (`wallFlightHit`; the per-wall
    arc-height gate is kept generic but never fires on a real bulkhead). A second crossing off the reflected
    line bounces again (hit two walls, bounce twice). Resolved in the shared `executeShot` right after the tent branch (auto ≡ interactive)
    and a rolling ball stops against a wall in `rollOut` (a new `walls` param). Walls break at the island
    gaps (open hull) so a star-carry stays open, and only ever SAVE a ball that would be lost to space
    (they raise Stableford — contract 4 by construction). Drawn by `style/walls.ts` (`styleShipWalls`,
    camera-proof rivet counts) off the same `hole.walls`; a bounce clangs the world's struck-metal voice
    + throws sparks (`onWallBounce` → `sfx.land(..,treeHit)`). `ShipWall` lives in the course contract.
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
  - OB = stroke-and-distance off the play-bounds box (which doubles as the OB trigger — don't
    shrink it casually).
  - All new generator draws gate on their feature being armed (contract 1); current
    `GENERATOR_VERSION` 19.
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
    play tournament vs the Warriors Three (three bespoke `contender` golfers; `warriorsThreeTotals` ghost
    gross, lowest wins, ties→player). The field SCALES with the run (GS-asgard-scaling): `warriorsEdge`
    sharpens every warrior by a per-hole stroke `edge` scaled off DEPTH (the parked run's `stopIndex`) +
    Ascension (`asgardFieldEdge` feeds BOTH the verdict and the live board), so a late-run encounter isn't
    a roflstomp — bounded, ties still to the player, and `edge=0` (shallow/base) is byte-identical. The
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
    source for headless AND reducer); A0 + a common bag is the classic boss, byte-for-byte. The
    auto-AI pin-hunts via `PlayHoleOptions.attackPin` (default off = byte-identical), armed for
    endless bogey-or-tighter bars and high-Ascension bosses; `playHole` takes `puttSkill` so putter
    perks reach the headless putt-out.
- **Competition & leaderboards** — `docs/decisions/competition.md`
  - The field is a deterministic STATISTICAL ghost (`ghostHoleStableford`), not N real ball-sims.
  - Voyage survival is your POSITION in one persistent field thinning to the final two;
    `competition.ts` is the single source for the drawn board AND real survival. Only the FINAL
    ordinary stop cuts to 2; every earlier target floors at 4.
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
  - The renderer draws the guard figure ONCE (the corner figure) — never also float the portrait badge.
  - The **Prognostic Parrot** (GS-caddy-parrot, faction **Planet Pirates**) reuses the SCRAMBLE machinery:
    `loadout.previewScramble` (0.33) is a per-full-swing proc where the pirate captain FORESEES the shot →
    you play a SECOND ball with the player's OWN golfer (`opts.shotMods`, never a partner) and keep the
    better (`pickBetterExec`). Threaded IDENTICALLY through the auto sim (`playHole`, gated `!opts.scramble`
    so a team duel wins) and the interactive reducer (`'shot'` shows the foresight choice card via
    `resolveScrambleShot`+`{preview:true}`; `autoShotHole`/watch auto-keeps like headless) — the proc is ONE
    `rng.bool(chance)` drawn BEFORE the shot in BOTH, so undefined/0 is byte-for-byte and best-of-two only
    ever RAISES Stableford (contract 4 by construction). It's NOT a guard/projectile caddy, so no
    `_gsFeel.forceRedirect` case — just the `caddyEffects` row + faction the RULE demands.
- **Putting** — `docs/decisions/putting.md`
  - Manual pace-meter by default; AUTO only via the Penelope Putter caddy. `takePutt(…, control?)`:
    control → manual, none → `onePutt` (auto/tests, byte-for-byte). Fringe-putt is interactive-only.
  - The make band SHRINKS with distance past the putter's `puttRange` (floored; =1 within range);
    the on-screen band draws the SAME shrunk window. Only the PACE window is distance-scaled;
    auto `onePutt` is untouched.
  - The break line STOPS DEAD at the confident read (terminus dot, nothing beyond) — read range is
    a visible gear axis (`puttSkillOf`, cap 1.0).
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
    sand/liquid families draw union-merged bodies (course-space, WeakMap-cached).
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
    on the SAME course-space channel `cetusRiverPath` emits. Motion rides the virtual clock (`now`),
    ZERO rng, so `animateCetus`-off (SVG map + tests) is byte-identical; PERF-neutral (geometry cached
    at mount, per-frame = re-project a short polyline + ~90 capped particles, NO `buildScene` rebuild —
    it replaces the equal static river the follow-cam rebuilt). Speed rides `_gsFeel.cetusFlowSpeed`.
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
    import clean in node.
- **UI layer** — `docs/decisions/ui-intro.md`
  - The screen flow is a PURE reducer (`ui/game.ts`): `(UiState, Action) → UiState`, no DOM/time,
    fully unit-tested. `app.ts`/`main.ts` render state + dispatch; save persistence + canvas mounts
    + the intro cinematic are side-effects there, never in the reducer.
  - The app shell is SPLIT (GS-app-split): `app.ts` keeps boot/dispatch/render wiring + the
    interactive play screen; every other screen builder lives in `src/app/*` (title/intro/result/
    shop/market/clubhouse/travel + `ctx.ts` with the live `state` binding, `duelHud`, `helpers`).
    Screen modules read `state` from `ctx.ts` and NEVER dispatch or import app.ts (no cycles);
    per-screen view state is an exported view object (`marketView`, `introView`, …) app.ts's
    wiring mutates. A new screen = a new `src/app/` module, not more app.ts.
  - Visual theme is the design-token CSS in `index.html`, not the SVG layer. The play screen is
    full-bleed and never scrolls; pull-to-power is the only shot input.
  - The settings cog rides EVERY screen (appended once in `render()`); "Return to title" is
    NON-destructive (an underway run parks as `resumable`). `persist()` snapshots the live run only
    when one is underway, else passes `state.resumable` through — NEVER snapshot the title's
    character-less placeholder run (it wipes saves).
  - Character select fits ONE screen in every mode (equal-height cards via `grid-auto-rows:1fr`);
    Ascension is picked WITH the golfer, never on the title, defaulting to your LAST pick
    (`Settings.lastAscension`). Difficulty is TWO native-select DROPDOWN pills on one compact row
    (GS-diffpills, `.gs-selpill` / `[data-selasc]` + `[data-selclubset]`): ⚔ Ascension (voyage, when
    tiers are unlocked) + 🎒 Club set / bag — the club-set pill shows on EVERY mode now (only when a
    better-than-common bag is owned) so a per-run bag downgrade is one tap from any format. The pills
    are view state (reducer-clamped); the club-set pick overrides + write-throughs only when CHANGED.
    Each VOYAGE card carries a club-UNLOCK badge tied to the selected Ascension (GS-ascension-clubs
    display, off `maxAscensionByCharacter`): 🔓 "win A_n → new club" when a win at the picked tier
    grows THAT golfer's bag, 🔒 "next club: win A_k" when the tier's already cleared (k = their next
    uncleared tier), ★ "bag complete" when full — so it's obvious which difficulty to play which golfer
    at to unlock clubs. The whole card is the button (its CTA is a footer label). GS-select-layout.
  - The stop intro is TWO mobile steps on one reducer screen (`'intro'` + view state `introStage`);
    `introShared()` derives world/notes/objective ONCE so the steps never drift. The Unending
    Universe past stop 0 opens on `'hole'`.
  - The post-stop recap (`resultScreen`) is a pure render off `state` — rarity-framed panel, stat
    tiles, clickable hole-by-hole strip.
  - The title is a hero wordmark + two GAME tiles reusing the doorway component
    (`.gs-navtile--game`; whole tile = the button, distinct only via the `--mc` accent — never
    regrow badges/launch bars/progress text). The Daily button is parked off the title for now.
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
