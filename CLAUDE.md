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
  (localStorage is the only copy). Current schema is **v18** (GS-fuel: `RunSnapshot.fuel`, optional
  → a pure version stamp; v17 was GS-warp's stamp); bump + add a migration when
  you persist a new field. Loadouts are rebuilt from perk *ids* (`loadoutFromPerks`), so most
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
   per club FAMILY (GS-flight-3): `FLIGHT_PROFILES` keyed by `flightClassOf` (the id-convention
   classifier the audio voices also use) shapes apex height + ground position, and the profile is a
   REQUIRED param through every consumer (resolve, knockdown/tent walks, aim overlay, animation) —
   a new club row picks up its flight with zero engine edits; retuning a row is a physics change
   (re-run the no-death-spiral harness, contract 4).
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
  the kind. **Crossings FLOW like real rivers (GS-rivers):** `riverChannel` holds the full carry width
  across the corridor (`|s| ≤ 1.2·halfWidth` — `validateCrossings` + difficulty untouched) but TAPERS
  the off-corridor arms — the mouth swells into its lake, the source narrows to a trickle — and
  `riverTerminals` ends both sides believably (mouth LAKE; source = spring pool / stand of TREES /
  taper-out, all `clearsPlayCorridor`-gated), so a river reads as flowing from a headwater into a sink
  rather than a band stopping in mid-rough. **And the crossing itself VARIES (GS-rivers-2)** so holes
  don't all read the same: a CHARACTER profile (STRAIGHT near-perpendicular / DIAGONAL angled carry /
  WINDING wandering arms) sets the angle + arm meander, and WHERE it crosses spans the whole hole (an
  early tee-shot carry → a late approach carry), not just the middle third — the caller passes a wide
  raw `t` and `riverChannel` CLAMPS it into the fair window `[0.15+dt, 0.8−dt]` (dt = the band's
  centreline span from angle+thickness), so it's fair BY CONSTRUCTION (generateCourse throws, no
  retry). All new draws inside the wildness-gated river block (calm holes byte-identical);
  `GENERATOR_VERSION` 14. **Hazards never overlap CROSS-family** (GS-hazard-blend): `dedupeHazardOverlaps` drops any
  hazard spawned on a different substance (trees exempt both ways; crossings always win) — a pure
  ZERO-rng post-filter, so the streams are untouched; SAME-family overlaps are legal and the render
  union-merges them into one body. **An ARMED lost-rough island hole then STRIPS every void-stranded
  hazard** (GS-cetus-water): `clearVoidHazards` (same zero-rng, lostRough-gated post-filter) drops all
  penalty pools (the abyss is the only penalty — "ponds in the void read wrong") and any sand/tree blob
  not overlapping a pad; only on-pad sand (clifftop coves) survives — the par-4/5 chains used to scatter
  the full flanking/pond/lake/greenside placement over the pads and deep. OB = stroke-and-distance off the play-bounds box (which doubles as
  the OB trigger — don't shrink it casually). **Variety is DECOUPLED from difficulty (GS-variety-2):** shape archetypes
  (cape/hairpin/double) and dogleg-corner blocking GROVES appear even on CALM stops (no wildness gate)
  — difficulty rides bend severity (`dogFac = 0.5 + 0.5·wildness`) + hazard density, not which shapes
  exist. **DEEP ROUGH (GS-deep-rough)** chokes the INSIDE of a dogleg's cut-the-corner chord (same walk
  as the groves, but a GROUND hazard a lofted bomb can't clear): land worlds fill it with the new
  `deeprough` lie (carry 0.5, the deepest recoverable land lie — cutting the corner GAINS NOTHING), the
  OCEAN world with `water` (the sea laps the sandy shore → a penalty carry). Opt-in per biome via
  `deepRough`; the lost-rough worlds (void/cetus) don't set it (untouched). Fair by construction —
  placed far from the BENT corridor even though it's on the straight chord (`polylineDist ≥
  fairwayHalfWidth + 22`), so the fairway route stays clean and penalty water passes `validateFairness`;
  wildness-gated (`DEEP_ROUGH_MIN_WILDNESS = 0.3`, above the stop-0 ceiling → forgiving opener) and
  ZERO-rng on a straight hole (the off-corridor reject fires first). Balance holds (the auto-AI plays
  the fairway, not the cut). Render is per-archetype (`style.ts DEEP_ROUGH`/`styleDeepRough`). Corridors
  can be BROKEN into 2–3 mown segments by rough gaps (`brokenCorridor`, biome
  `roughBreaks`; skipped on lost-rough worlds where a gap = the abyss). A hole gets a forced-carry
  CROSSING **or** greenside DRAMA, never both: greenside penalty RINGS (`sanctioned:true` on Feature,
  exempt from `validateFairness`, proven by `validateGreenApproach` — kept off the approach window +
  lane) + an APPROACH LAKE ~3/4 up fill the mid/green zone that used to go quiet after driver range.
  The per-world fairway MOWING PATTERN (`fairwayStripes`) differs by archetype (horizontal / vertical
  grain / faceted-diagonal / checker) so turf reads distinct beyond colour. Difficulty bars were
  deliberately relaxed (fun over the bar; tune per-hole later) — the strict blow-up guard stays.
  **Void & Cetus deep par 4/5 are ISLAND-HOP chains (GS-cetus-5):** a lost-rough par 4/5 bends
  (dogleg/cape/S) AND breaks into 2–4 clifftop/asteroid PADS split by VOID carries (the `if (lostRough
  && par>=4)` gap block + shape fall-through). Structural validators are silent on a lost corridor's
  shape (the void is the implicit `roughLie` lie, not a hazard poly), so the gaps carry their OWN proof
  (GS-cetus-gaps): every void carry is COMPLETABLE BY CONSTRUCTION with the common starter bag —
  `separateIslandGaps` (pure, zero-rng) clamps each gap to a wildness-ramped carry-relative ceiling with
  landable pads between, lost-rough corridors sample denser so `brokenCorridor`'s ≥3-point rule can never
  drop a sliver pad and fuse two gaps into a mega-void, and `validateIslandHops` proves it per hole in
  `generateCourse`'s throw path. Still deliberately death-spiral-brutal: these two are in
  `BALANCE_EXEMPT_BIOMES` and skipped by the death-spiral harnesses (human interest first; AI/scoring
  rebalance is GS-cetus-6). All new draws gate on lost-rough so every other world + calm cetus/void stop
  is byte-identical.
- **RPG meta-loop** (`docs/decisions/rpg-meta-loop.md`). The spine: `startRun → [playStop → buy* →
  travel]*` until the run's survival rule fails; pure/deterministic. The **Voyage** is the winnable
  campaign (3 arcs, boss each, `endedReason 'won'`); the **Unending Universe** (GS-unending) is the ONLY
  endless format — `flat`/`ladder` are retired (`getFormat` folds their ids to the default): 4-hole stops
  forever, survival a PER-HOLE PAR-RELATIVE bar (`endless.ts`: quad bogey holes 1–8, one stroke tighter
  every 8, birdie-or-better from 41; a pickup always fails) threaded identically through `playStop` (the
  hole loop breaks at the first miss — a clean PREFIX of the `:play` stream) and the interactive
  `holeComplete`, so auto ≡ interactive holds; `run.holesSurvived` (snapshotted) numbers the bar, and
  milestones 40/60/…/140 bank shard bonuses via `bonusShards` (kept on a bust). Course difficulty keeps
  riding galaxy distance + `routeDifficulty`, so the universe escalates after the bar parks at birdie.
  **The Unending Universe is SCORED like golf (GS-golf-score):** survival is unchanged (the per-hole bar,
  `holesSurvived` is still the headline), but the presentation is a running golf ROUND — cumulative
  gross + par accumulate on the Run (`grossStrokes`/`parPlayed`, snapshotted, advanced by `finishStop`
  over the SURVIVED holes only, always 0 for non-gate formats → the voyage is byte-identical), giving
  gross / to-par / NET (`endless.ts netStrokes`, a club-set handicap so runs on different bags compare
  fairly). The STARTING CLUB SET is the mode's difficulty axis (green/blue/purple/orange = common→
  legendary rarity; `CLUB_SET_DIFFICULTIES`), picked on character-select for endless only (bounded to the
  owned `bagTier`, green always; the voyage always plays the full owned tier), a weaker set the sterner
  test but netting more strokes. Finished runs bank into the persisted `endlessRuns` last-runs
  leaderboard (save v16, capped, newest-first; written ONCE in the reducer's `runEndUpdates`) grouped by
  club set, showing holes reached + net + golfer. Pure/zero-rng display + a per-run record — the survival
  gate, the balance harness, and every existing seed are untouched. UI in `render/endlessCards.ts`
  (intro / end-of-hole / result / gameover), all gated on `holeGateArmed`.
  **WARP fast-forwards only PROVEN holes under the hidden AUTOMATIC-BIRDIE rule (GS-warp):** the
  intro's Warp button auto-plays the whole stop on the ordinary `:play` stream and FLOORS each hole
  at a birdie (`warpBirdieHole` — the mirror of the pickup rule; a real eagle/ace stands), so a
  warped stop can never bust — measurement proved no honest assist can deliver deep holes (the 41+
  birdie bar compounds exponentially; see `reports/endless-ai-depth-2026-07-04.md`). Fairness by
  scope, not by golf: `canWarpStop` allows warping ONLY while the run is a contiguous warp prefix
  (`holesSurvived === warpedThrough`) AND the whole stop fits under `endlessBestHoles` — new ground
  is always hand-played, so best-holes/milestones/unlocks stay un-farmable; a warped stop banks NO
  milestone shards (`finishStop`'s `warp` opt) and never grants the ace ship (no `aceUpdates` in the
  reducer's `warpStop`). The last-runs board ranks by FURTHEST HOLE (`endlessRecordsByDepth`, newest
  10) and every row carries its honest hole RANGE (`recordRange` — "50–67" vs "1–49", ⚡-marked), so
  a warped run can't masquerade as a solo one. Save v17.
  **Ship FUEL meters the journey (GS-fuel, redesigned GS-fuel-2):** every jump burns `distanceJump`
  units off `Run.fuel`; the starting tank IS the capacity (`tankCapacity` — voyage 8 = its
  single-hop travel count, machine-checked vs `stops.length`; unending 12, sized to run dry
  mid-run). Fuel is priced by DEPTH (`fuelUnitCost` = 10 + 2·distance, cap 60 — cheap near home,
  dear in deep space) so "fill up here vs. gear now" is a real shop decision. ONE rule lives in
  `travel` (auto ≡ interactive by construction): a short tank buys the shortfall at the LOCAL
  price, paid before the toll — and the route sheet prints that exact bill ON the Jump button,
  never silently; `buyFuel` (Fuel Depot: Pro Shop + journey screen) sells the same price,
  capacity-clamped. A lane whose bill beats the purse is LOCKED (`canTravel`; reducer no-ops,
  starmap dims the planet with `needs ⛽n ✕`, sheet disables Jump); all lanes locked ⇒ the run ends
  `'stranded'` (`strand`; pocket change converts like a bank — `cashOutShards`). Fuel is drawn ONLY
  via `render/fuel.ts fuelGaugeHTML` (segmented cell gauge, mini on the run header; `.gs-fuelbar`/
  `.gs-fueldepot` tokens) — never a bare number. Pure arithmetic, ZERO rng — every seeded stream is
  byte-identical; save v18 (`RunSnapshot.fuel`; a pre-fuel resume gets a fresh tank, an
  over-capacity legacy tank keeps its fuel but can't buy past the cap). **Ship outfitting hangs off
  that economy (GS-fuel-3),** all rebuilt from perk ids on resume (no save bump): Ion Thrusters
  (`loadout.fuelEfficiency`, every jump −1 ⛽ FLOORED at 1 — a jump is never free; every ⛽ bill
  honours it, and the journey-map ship trails `shipArt.ionWake` — drawn OVER the hull so it
  replaces the stock flame, default-off so all other ship mounts are byte-identical), the Reserve
  Tank (`loadout.tankBonus` capacity + arrives full via `ShopItem.fuelBonus`, poured ONCE in `buy`
  — never in `apply`, or resume would double-grant), and the eagle siphon (`finishStop` refuels one
  cell per holed eagle-or-better, capacity-clamped, never on warp — mirrors the milestone rule).
  The Clubhouse spaceport parks a hand-placed (zero-rng) fuelling station between the front pads.
  `tests/fuel.test.ts` guards.
  Milestones grant the earn-only **Evergreen** cosmetics (`unlockHoles` rows; `canBuy*` refuses them —
  bag@40 in the NEW 4th apparel slot `bag`, cap@60, pants@80, mythic Green Jacket@100, secret mythic
  ship@150; all hidden from the market until owned — GS-hide-unlocks, see the Trade Market bullet),
  keyed off the persisted `endlessBestHoles` (save v13,
  with `golfBagByCharacter`) through the reducer's `endlessProgressUpdates` — applied at EVERY
  stop-scoring site, not just run end; `tests/endless.test.ts` machine-checks the unlock-id↔catalogue
  link and the gate ladder. **A hole-in-one is the ONLY way to earn the secret Comet Rider ship
  (GS-ace-ship):** the `comet-rider` row is now `secret:true`/`cost:0` (hidden from the market, never
  buyable), granted by the reducer's `aceUpdates` at every stop-scoring site — `aceShipUnlock` adds it to
  global `ownedShips` on ANY ace the player doesn't already own (NOT a first-ace flag), so a player who
  aced before the feature shipped still earns it on their next ace and nobody is ever locked out; the ace
  takeover reveals it (`showAceCelebration` `shipUnlocked`). Zero rng, no save bump (`ownedShips` already
  persists); composes AFTER `endlessProgressUpdates` so a hole-150 + ace on one stop keeps both grants.
  **Pro Shop rarity is VOYAGE-paced**: a winnable format draws
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
  shard price) — **but every unlock-gated item is HIDDEN until it's unlockable (GS-hide-unlocks):** the
  earn-only Unending-Universe cosmetics (`unlockHoles`/`secret` ships + apparel) stay out of the rack until
  OWNED, and the gated club-set bag tiers (`bag.ts BAG_SETS`) until their Ascension gate is cleared (⇔
  available to buy). ONE reveal predicate per catalogue (`shipRevealedInMarket`/`apparelRevealedInMarket`/
  `bagSetRevealedInMarket`) drives the filter; a section with nothing revealed drops out entirely (Caddy
  Bags before any is earned; club sets before the first gate). Pure display filter — zero sim/rng/save
  impact; a new secret unlock is a `unlockHoles`/`secret` row, nothing else. A **`Show Owned` view toggle**
  (default OFF, reset on every `openMarket`) drops already-owned gear from every rack so the market lands on
  what's still buyable; a fully-owned section keeps its `owned/total` header + a "flip Show Owned on" note.
  The Market also carries a **direct `openClubhouseHall` button** (guarded to also fire from `trademarket`)
  so a shopper can jump to try gear on without a title round-trip. Both are view-only module state
  (`marketShowOwned`, like `collapsedMarketSections`) — no save/rng impact, no test-hub hook. The **Clubhouse** (a title-screen section, one screen per golfer) EQUIPS owned gear PER
  character (`shipByCharacter`/`hatByCharacter`/`shirtByCharacter`/`pantsByCharacter`, the last added GS-pants-outfit
  save v11), so each golfer flies its own ride + wears its own look head-to-toe. The per-golfer Clubhouse is a
  **tap-to-restyle stage** (GS-clubhouse-stage): a big full-body avatar (`golferPreviewSVG`, ONE proportional
  cel-shaded character at every size (GS-clubhouse-glow) — anchors are fractions of `h`, offsets scaled by
  `S=h/210`; wears the signature cap when no hat is equipped, mirroring on-course; SVG def ids namespaced by
  `uid`, defaulting to an input hash so co-mounted figures never cross-tint) whose hat/shirt/pants are three tap
  bands, over a garage-bay tile showing the parked ride — tapping any of the four reveals just that slot's owned
  rack (equip toggles / owned fleet); a "🏠 Back to Clubhouse" (`clubhouseBackToHall`) returns to the hall to
  outfit another golfer without a title round-trip. The open slot is view-only module state
  (`clubhouseSlot`, like `inspectGearId`: toggled via `[data-clubslot]`, reset on open/close, zero save/rng
  impact). The `apparel.ts` catalogue fills three slots (`ApparelSlot` hat|shirt|pants); a cosmetic **set**
  completes (`equippedSet`) only when EVERY slot it defines is worn. The Clubhouse HALL is a painted 19th-hole
  bar/fireplace **lounge** over a **spaceport** panel (GS-clubhouse-lounge + GS-clubhouse-glow +
  GS-clubhouse-spaceport, `render/clubhouseLounge.ts`; eyes-on via
  `scripts/clubhouse-preview.mjs` — re-shoot it after touching `apparelArt.ts`/`clubhouseLounge.ts`): the
  golfers loiter in it wearing their outfits (each figure IS the button to
  outfit them, a brass nameplate at its feet for identity), placed at a seeded shuffle of furniture-anchored floor spots
  keyed off `clubhouseVisit` (a finished-run counter bumped once in `runEndUpdates`, save v12) — so they
  appear to have milled around while you were away; the spaceport below is a landing ring around a
  putting green parking each golfer's equipped ride on its own pad (the ship is the same `openClubhouse`
  button; pads dealt by the same visit Rng AFTER the spot draws, so lounge arrangements are unchanged).
  Mount figures/ships in TIGHT frames (golfer 72×210, ship 96×62) — a wide frame is invisible margin
  that shrinks the art to doll size against the furniture; rare+ gear pops via `popFilter`'s
  rarity-coloured drop-shadow. Purely cosmetic: seeded via `Rng` (never `Math.random`),
  zero sim/rng-stream impact. The played character's ship (journey map) + outfit (`golferLook`) resolve via
  `shipForCharacter`/`hatForCharacter`/`shirtForCharacter`/`pantsForCharacter`. Shards also
  buy permanent **default-bag tiers** (`bag.ts BAG_SETS`, GS-bag-tiers): a won Ascension gate (clear
  A2/A6/A11 → `maxAscension` ≥ 3/7/12) unlocks a rare/epic/legendary bag-and-set that re-stamps EVERY
  golfer's starting bag to that rarity (the existing Planet/Phoenix/Solar reward sets via `applyBagTier`,
  baked at `startRun`/`resumeRun` — NOT a new club, just the reward machinery applied to the default bag).
  The owned tier is a Pro-Shop FLOOR (`offerableClubs` hides clubs below it) and a no-op at `'common'`
  (byte-for-byte off). `ASCENSION_MAX = 15` so A11 is reachable. **Ascension victory club unlocks**
  (`club-unlock.ts`, GS-ascension-clubs, save v9): a NEW **per-character** Ascension clear (a won voyage
  that pushes THAT golfer's own `maxAscensionByCharacter[id]` higher — save v14, NOT the global `maxAscension`
  the bag tiers/difficulty select still use, and NOT every win) permanently adds one random club to
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
  difficulty/atmosphere event (economy/cut/meta only — NEVER generation rng). **Every non-none course
  effect carries a REAL play hook, machine-checked** (GS-journey-fx-2, `tests/journey-effects.test.ts`):
  numeric — `effectWindMult` (clamped pure post-gen scale on `hole.wind`) and `effectCarryMult` (a pure
  post-gen `biomeMods` carry row, the lowgrav mechanism, so `biomeCarryMult` feeds HUD/AI/sim ONE number);
  geometric — tradeMarket's collidable tents (GS-tents / GS-tent-interactions), meteorShower's scorch craters (GS-meteor-scorch,
  `sim/scorch.ts`) and the generalised GROUND PATCHES (`sim/patches.ts`): comet→`stardust` (a BONUS lie,
  hot AND true), frostfall/blizzard→`ice`, spaceJunk→`junk`, darkMatter→`tar` (a sticky distance-killer,
  the dead-straight inverse of ice's wild skid) — pure seeded per-kind streams, rest-lie conversion in
  `executeShot`, drawn + played from the SAME source. The route card states every hook (wind/carry chips
  computed from the physics tables; geometric hooks via `CourseEffectInfo.play`), so a lane reads pre-jump.
  **Trade tents ring EVERY hole of a tradeMarket stop, each with FIVE randomised interactions (GS-tent-interactions):** the
  tradeMarket route stamps its collidable tent ring on all holes (`Hole.tents`, stamped by
  `run.ts armTentHoles` — zero generation rng; a single surprise hole was too rare for a "trade market",
  so the whole stop — 6 holes voyage / 4 unending / N future — is the trade-camp world), and each hole's five tents carry an
  `effect` dealt by a per-hole shuffle (`sim/tents.ts assignTentEffects`) so COLOUR never predicts effect
  and no two greens play alike.
  The bounce PHYSICS is identical for all tents EXCEPT the **marmot**, whose bite is a deterministic LOST
  BALL (stroke-and-distance) resolved in `executeShot` (so auto ≡ interactive); the other four are
  interactive-only META reactions layered in the reducer like the ace/unlock side-effects: **ow**/**watch**
  = flavour bubble only; **marmot** first-ever bonk unlocks the persistent **Marmot Bartender** (save v15,
  a `clubhouseLounge` cosmetic); **fortune** grants a free MULLIGAN spent on the next tee shot (reuses the
  scramble two-ball pick, `mulligan` flag); **starmart** opens a mid-hole **StarMart** shard shop
  (`run.ts starmartOffer` — no commons, epic/legendary boosted, priced 5/10/15 shards, items last the run
  via `loadout.perks`). The speech bubble anchors on the tent CENTRE in course space, re-projected each
  frame (`ShotLog.tentHit.c`) — the fix for the old bubble that drifted with the ball. Every other hole/
  world stays byte-identical (all gates are `hole.tents` + effect-armed). `tests/tents.test.ts` +
  `tests/starmart.test.ts` + `tests/journey-effects.test.ts` (every-hole invariant) + `tests/ui.test.ts`.
  **The sky roster is 17 effects (GS-journey-weather adds 5):** `blizzard` (gale wind + ice — the storm-cold
  cousin of frostfall), `radiant` (carry↑ + wind↓ — a bomber's-paradise still, bright sky), `dustStorm`
  (wind↑ + carry↓ — grit that gusts AND drags), `solarWind` (steady wind↑, a third storm that isn't
  lightning), and the spacey `darkMatter` (wind↓ + tar patches, star-lensing void sky). All reuse the
  proven wind/carry/patch machinery (no new physics extremes — the no-death-spiral harness stays green).
  **A `salvage`-category lane LOOTS A CLUB, not a shard drip (GS-journey-fx-3, `salvage.ts` +
  `tests/salvage.test.ts`):** `routeClubFind(ev)` (salvage lanes only, rarity floored at RARE) drives
  `salvageClubFind`, which picks a club you don't carry from `offerableClubs` filtered to that rarity
  (prefers a NEW type over a same-type upgrade), applied in `travel` — resume-safe FOR FREE (the find is a
  shop `CLUB_ITEM`, so its perk id round-trips via `loadoutFromPerks`, no save bump), deterministic on a
  PRIVATE stream (no shared draw moves), and only ever RAISES Stableford (can't spiral). Bag full at that
  tier → a rarity-scaled credit consolation. The route card previews the EXACT club (same stream, can't
  lie). Route events no longer carry `shardBonus` — shards are a run-END reward now (distance/win/bank),
  so meta progress rides how far the loot carries you; `run.bonusShards` moves only via endless milestones.
  The three lanes always land DISTINCT world archetypes, never the one you're on (`routeTheme` avoid-set
  via a filtered `pickThemeFrom` redraw, NOT a retry loop; split stops cross two archetypes —
  GS-journey-variety); a new course effect = a `COURSE_EFFECTS` row + a `routeEffect` mapping + a
  `weather.ts` showpiece on its OWN seeded stream. **A fresh run opens RANDOM + non-hard
  (GS-fresh-start):** the boot/new-run seed is random (`app.ts freshRunSeed()` — the ONE sanctioned
  `Math.random`, side-effect layer only; `?seed=` pins it; the dated-seed Daily button is PARKED off
  the title for now — GS-title-2), and stop 0's
  theme draw skips `HARD_ARCHETYPES` (inferno/tempest/void/cetus — same single draw off a filtered pool,
  no other stream moves); journey lanes randomize with the seed. Characters/talents/
  ace rewards ride `loadout.perks` ids, rebuilt on resume (no save bump). Bosses: solo matchplay +
  Arc-II team duel (best-ball/scramble), played on a separate `:boss` rng so your ball stays a
  non-boss stop. **Bosses SCALE with Ascension (GS-boss-scale):** every duel carries a run-derived
  `BossEdge` (`bossEdgeForRun` — the ONE source for headless playStop AND the reducer's pre-play):
  handicap/dispersion/distance sharpen per tier (knobs in `match.ts`), the boss bags the run's OWN
  `bagTier` (gear parity), and from `BOSS_ATTACK_ASCENSION` they pin-hunt via GS-ai-attack; A0 + a
  common bag is the classic boss, byte-for-byte. **The auto-AI pin-hunts under pressure
  (GS-ai-attack):** `PlayHoleOptions.attackPin` (default off = byte-identical) aims a green-REACH
  shot at the FLAG via the shared `attackTarget` rule — armed in the Unending Universe once the bar
  is bogey-or-tighter (`endlessAttackArmed`, threaded identically through `playStop` and the
  interactive `autoShotHole`/`autoDecision`, contract 2) and for high-Ascension bosses. And
  `playHole` now takes `puttSkill` (`playerHoleOpts` passes `puttSkillOf`) so putter perks reach the
  HEADLESS putt-out — they used to work only interactively, a silent auto ≢ interactive drift.
- **Competition & leaderboards** (`docs/decisions/competition.md`). The field is a deterministic
  STATISTICAL ghost (`ghostHoleStableford`), not N real ball-sims. Survival in the voyage is your
  POSITION in one persistent field that thins to the final two (`arcCut`/`VOYAGE_SURVIVOR_TARGETS`) —
  `competition.ts` is the single source for both the drawn board and real survival. Only the FINAL
  ordinary stop cuts to 2; every earlier target (Ascension included) floors at 4 (GS-cut-balance), so
  the 1-v-2 exists only at the last boss. `league.ts`
  imports `run.ts`, never the reverse (no cycle); the matchplay boss-id is resolved in the UI reducer.
- **Caddies** (`docs/decisions/caddies.md`). One named caddy at a time, rarity-weighted into the
  shop offer; the first hire blocks the rest. Each folds ONE loadout field (`driverAnywhere`/
  `chipInBoost`/`caddyGuard`/`clubSuggest`/`confidenceMod`/`lieRelief`/`puttBoost`/`autoPutt`).
  THE RULE (machine-checked by `tests/lab.test.ts`): every `NAMED_CADDY_IDS` entry must surface a
  `caddyEffects` row. Guard redirects + chip-ins add rng ONLY when armed + qualifying. A guard's `side`
  is a FAIRWAY side (ducks cover left-of-fairway, sheep right): `resolveShot` classifies off the hole's
  `centreline` via `ShotInput.fairwaySide` (round.ts closes it over the hole), NOT the shot bearing —
  a recovery aimed across from the rough used to misfire the ducks onto right-side misses. The renderer
  draws the guard figure ONCE (the bottom-left corner figure the projectile fires from); do not also
  float the portrait badge on the watch screen (it double-rendered the same caddy).
- **Putting** (`docs/decisions/putting.md`). Manual pace-meter by default (`manualPutt`); AUTO only
  via the Penelope Putter caddy (`loadout.autoPutt`) — no manual toggle. `takePutt(…, control?)`:
  control → manual, none → `onePutt` (auto/tests, byte-for-byte). Fringe-putt is interactive-only.
  `puttBoost` upgrades widen the make-band; base loadout returns `{}` so auto stays stable.
  **Putting has DEPTH now (GS-putt-depth)** — a real reason to buy putters: the make band SHRINKS with
  distance past the putter's confident `puttRange` (`puttBandDistanceFactor`, floored, =1 within range →
  a tap-in is byte-for-byte the old flat band; the on-screen MAKE band draws the SAME shrunk window), so
  a long putt is a nervier stroke and a better putter (bigger `puttRange`, derived from `puttBoost` in
  `puttSkillOf`) holds a wide band + reads further. **The break line STOPS DEAD at the confident read
  (GS-putt-read):** a terminus dot ends it and the blind stretch draws NOTHING (the old faint tail to the
  cup read as a free full-length read), so read range is a VISIBLE gear axis — putter perks stretch the
  line (`puttSkillOf` boost→range cap 1.0), the common **Green-Reading Book** adds a flat `puttReadBonus`
  +4y (manual-only, paired with a small `puttBoost` so auto still gains — contract 4), and a green-reading
  Mystic Mole sees the whole break (`RenderOptions.puttReadFrac` 1).
  Only the PACE window is distance-scaled — the lateral wobble stays keyed to the putter's inherent band,
  and auto putting (`onePutt`, no slope/range) is untouched. And HARDER stops tilt the greens MORE: the
  slope-magnitude multiplier floor rises with wildness (`range(0.4+0.45·wildness, 1)`, still ≤ biome
  `greenSlopeMax`, drawn from the SIDE slope rng so terrain is byte-identical and a CALM stop keeps the old
  draw), read via a finer/denser fall-line arrow grid on steeper greens (`styleGreen`, camera-proof off the
  deterministic mag). No new `_gs*` hook. Guarded by `tests/putt-depth.test.ts`.
  **Greens BREAK in more than one direction (GS-green-contour):** every green layers 1–2 mound/hollow
  LOBES (`Hole.greenContour`, own side rng stream — terrain/pin/plane draws byte-identical) over the
  `greenSlope` plane, and `greenSlopeAt` is the ONE local field the resolver's integrated break
  (`puttBreakProfile`; no lobes ⇒ the old closed form byte-for-byte), the S-curving preview line, the
  "double-breaks" read (`puttBreakBow`, also the putt-cam frame) AND the renderer's per-cell fall-line
  arrow field all sample. **The contours are REAL GROUND now (GS-green-contour-2):** the field math
  lives in the surface-agnostic `sim/contour.ts` (`slopeFieldAt` + `heightFieldAt`, the closed-form
  potential whose gradient is −slope — the intended foundation for contoured FAIRWAYS later);
  `rollOut`'s green run-out samples the LOCAL field per step (still a straight line — the
  roll-invariant holds; plane-only holes byte-identical; this was the sanctioned physics retune,
  death-spiral harness re-run green); a manual putt's `PuttLog.path` carries its true curved travel
  (the preview curve at the struck aim/pace, wobble sheared in linearly, ending exactly at `to`) and
  the play view walks it by arc length so a double-breaker visibly curls (auto `onePutt` stays
  pathless → the straight lerp). The ART reads the same numbers: `render/contour.ts contourIsolines`
  marching-squares `heightFieldAt` into topo rings (course-space grid + deterministic levels ⇒
  camera-proof; WeakMap-cached per hole; drawn via the open-polyline `path` prim — 'poly' closes with
  a chord, never use it for open curves), ELEVATION-CODED in the biome's own green `Shade` (each
  `Isoline.frac` 0→1; high rings stroke light toward white, low rings dark toward shadow, void/cetus
  muted ×0.72 — never a flat white ring, it vanishes on pale greens and glares on dark ones), and
  each lobe shades as directional relief under the shared `LIGHT_UL` (lit-flank + shadow-flank
  glows; hollows inverted per the emboss rule).
  `tests/green-contour.test.ts` guards field↔height consistency, isolines, local-field roll and the
  curved-path contract.
  **Putt-FEEL rules (GS-putt-feel):** the fall-line arrows are PX-CAPPED in `styleGreen` (prims are
  screen-space — span-proportional chevrons ballooned into bold lines across the whole green at putt
  zoom; the caps never bind at map zoom). The putt watch-cam reuses the putt screen's exact framing
  (`puttViewRadius`, the `decisionRadius` pattern) so strike→watch never pops zoom, and the frame pads
  for the break's lateral bow off `breakYd` (aim-INDEPENDENT — the camera holds still while nudging).
  The ◄/► aim is per-putt scaled (`puttAimStep`/`puttAimMax` — the clamp always reaches past the ideal
  borrow, so no putt is UI-unmakeable) with press-and-hold auto-repeat + quick-tap streak acceleration,
  and nudges update SURGICALLY
  (`puttAimRefresh` swaps the map SVG + label in place — a full `render()` remounts the pace meter and
  resets its sweep mid-aim).
- **Render layer** (`docs/decisions/render.md`). ONE pure projector (`render/project.ts`) both
  renderers share — never reimplement the transform. ONE shared cell-shaded scene builder
  (`render/style.ts buildScene` → `Prim[]`); SVG = static map, Canvas2D = animated play view. All
  scene randomness is mulberry32 seeded from `hashHole()` (NEVER `Math.random`) on documented streams
  (`rng`/`crng`/`hrng`/decor seeds) so the SVG is byte-stable — adding a draw must not perturb the
  `rng` stream order. SVG clip/gradient ids are per-hole (`holeIdPrefix` → `scenePrimsToSvg`): ids
  are DOCUMENT-global, so co-mounted hole SVGs sharing a `gsc0…` counter cross-clip each other — it
  masquerades as a flat-turf/palette bug (GS-cetus-4). The cetus star-river is ONE corridor crossing
  (spring → fairway → plateau edge), spill FIXED in course space; its waterfall PAINTS only when the
  drop lands off-land (rng still consumed) — never re-anchor it per-frame in screen space.
  **The scene is also CAMERA-PROOF** (the follow-cam rebuilds it per frame):
  rng draw counts never read the projection (place in course space, consume unconditionally, cull
  at paint — never retry on `inView` or size a count off projected px) and `posHash` keys are
  course-space, never screen px — `tests/camera-stability.test.ts` guards both; `archetypeDecor`
  goes further and pushes its few prims UNCONDITIONALLY (an edge-straddling paint cull still flips
  the prim COUNT between frames). **Rough is ROUGH;
  space starts at the OB frame (GS-rough-frame):** the land hull fills `playBounds`+apron with the
  world's rough palette (`LAND_SPACE_BLEND` stays small; never star-salt the turf; every archetype's
  `rough.base` must sit ≥30/255 brightness above its `ARCHETYPE_SPACE.base` — machine-checked), and
  the rough IS the biome's ground COVERING (GS-ground-cover): the ramp is the covering's colour
  (snow / beach sand / moss / ash / scree / moor) and the `GROUND_COVER` table + `groundCover()`
  pass texture it (mottle/grain/ridges/sparkle + biome-characteristic raised `tuft` CLUMPS —
  GS-rough-cover-2: grass blades / mineral shards / cinder tussocks, `density`-boosted on the worlds
  that read as a flat slab — crystal/tempest/inferno; own seeded stream, clipped to land) — every
  archetype has a row EXCEPT void/cetus (bespoke ground rules; machine-checked). **Whimsical
  EASTER-EGG props hide in the rough (GS-egg, `EGGS` table + `easterEggs`):** a few thematic props
  per hole (snowman/igloo/penguin, sandcastle/umbrella/surfboard, gnome/picnic, geode, toadstool
  cottage…) placed ON land, OFF the corridor (a 9-yd buffered cut-grass reject) and off penalty
  liquids, on their OWN dedicated stream — a treat you find by scanning the whole hole; void/cetus
  are excluded (no `EGGS` row). Both passes follow the archetypeDecor camera-proof contract (fixed
  prim count per prop off course-space `posHash`, unconditional push, course-space rejection). An
  ARMED lost-rough hole (`roughLie` biomeMod, void/cetus deep stops) instead floats a platform per
  play feature in the open deep (the void's deep = negative-energy rifts) — the render mirrors the
  sim's lost-ball gate. **Platforms + hazard families merge through `render/merge.ts`
  (GS-hazard-blend):** platforms are `dilateUnion(fairways+green+tee, 14)` (never a mitred
  `offsetPoly` outset — it folds at concave bends and the flipped winding paints a star gap), and
  sand / each liquid family draws its `unionPolys` merged bodies (course-space + WeakMap-cached, so
  merged-body rng counts stay camera-proof); touching bunkers read as ONE complex, a creek pools
  into its lake. Those pads are extruded side-on 3D by `platformCliffs` (cetus blue clifftop /
  void violet asteroid, `CliffLook` palette); a CALM cetus/void stop (playable rough everywhere, can't
  be islands) instead gets `raisedShelf` — an outset rock pedestal + shadow + lit rim under the
  fairway/green so the corridor reads as a two-tier raised mesa at both zooms (GS-cetus-6, render-only).
  **Carved features share ONE light so a hole reads as one lit landform, not a collage (GS-inset,
  refined GS-inset-2):** a single upper-left `LIGHT_UL` drives `insetEmboss`/`embossChildren` (repaint
  the interior with a SLIM shadow on the near up-light rim — base re-laid AWAY from the light);
  `styleSandFamily`/`styleLiquidFamily` use them so bunkers/water/lava read as DUG IN (water's
  up-light bank shadows the surface, its shore dimmed from candy-cyan). GS-inset-2: NO drop shadow is
  cast onto the turf — a shadow on the surrounding grass read as the feature FLOATING proud of the
  land (the "raised/bevelled outward" bug). The depression is a THIN lip, not a big shadow blob: `w`
  is capped HARD by the body radius (`half*0.14`) so it stays a slim rim at the zoomed-in PLAY scale
  (a scale-proportional band ballooned into a distinct dark shadow across a third of the feature —
  worse than raised); sand drops its bright far-floor pool (the lit-pool-vs-shadow contrast was the
  hard "distinct shadow"). For the same reason the GREEN is FLUSH with the fairway (no cast shadow —
  only its own mown fringe/collar rings ease it in); the shelf/void-glow worlds still model their
  raised corridor edge. The emboss is inlined as clip CHILDREN, never a nested clip. Land tone-patches
  are small faint mottle, never viewport-spanning "spotlight" washes. All pure geometry — ZERO rng
  draws/reorders (void/cetus byte-identical). Palette: `*.wall/bank` tones.
  **The fairway reads as mown INTO the land (GS-fairway):** `styleFairways` takes an optional `collar`
  (a wider first-cut ROUGH band `mixHex(fw, rough, 0.72)` under the light fringe) + a directional
  up-light SHEEN, so the corridor sits in a graded fairway→first-cut→rough transition, not a bright
  tube on top. Gated to parkland worlds (`arch !== 'void' && 'cetus'`); void/cetus edge their corridor
  with a glow rim / raised shelf, so they pass NO collar and stay byte-identical. Pure geometry, zero rng.
  **HAZARDS ease into the turf the same way (GS-cetus-blend):** `styleSandFamily`/`styleLiquidFamily`
  each lay a soft grassy MARGIN just outside the body (`mixHex(rough, sand|shore, 0.42)`, grouped UNDER
  every body so a merged complex shares one seamless margin) — the land thinning toward the hazard, so a
  bunker/lake reads set INTO the ground instead of a hard-edged sticker; blended toward the hazard (never
  darker than the turf → not a floating shadow, the GS-inset-2 lesson). **The hazard INTERNALS blend too
  (GS-hazard-blend-2):** water/lava deepen through a SMOOTH ramp of feathered `offsetPoly` rings
  interpolating base→mid→deep (7 rings, shape-following — a river darkens toward its centreline, a lake
  toward its middle) instead of the 2 hard contour bands that read as a topographic map; bunkers drop the
  harsh full-width white rake BARS for a smoothly shaded bowl (inset rim shadow + a soft down-light sunlit
  swell + faint rim-following rake arcs). All pure geometry — the liquid flow/glint draws still consume
  the identical rng, so every seeded scene is byte-stable. **And
  void/cetus fairway+green STRIPES were retuned down (GS-cetus-blend):** their wide light↔dark VALUE
  spread banded even a normal mow into discordant bright/dark stripes over the smooth luminous platform,
  so `MOW_BLEND` now mutes them BELOW parkland (void 0.4 / cetus 0.42, dark eased to `k·0.72` on every
  world) and `styleGreen` softens its stripe for those two worlds (0.52/0.36 vs the parkland 0.7/0.5) —
  parkland stays byte-identical.
  The ANIMATED weather layer honours the same land: its pinned twinkle
  starfield masks off `landPolysCourseFor` (`WeatherOpts.starMask`; moving sky — shooting star/
  meteors/ambient air — stays unmasked); on a meteor-shower stop it also LANDS one meteor per cycle
  INTO a drawn scorch crater (`WeatherOpts.strikeTargets`, fed the craters' screen positions by the
  play view's LIVE projector — clock-driven, cosmetic, re-burns an EXISTING mark, never spawns one;
  the aim overlay's wind-only projector must NOT feed it, same reason it can't feed starMask).
  Guards: `tests/biome-identity.test.ts` + `tests/weather-mask.test.ts` + `tests/weather-strikes.test.ts`. The decision map's
  framing must hold still for the whole shot decision (frame on the pin-aim full-power spread, not
  the live drag), and the shot animation starts at the decision map's exact `decisionRadius`. **The
  aim-cone overlay is SCALE-HONEST (GS-spray-zoom/GS-spray-block):** every layout decision (arc
  sampling, zone-% labels, the merged `lo–hi y` carry label) reads the projector's px-per-yard, and
  the blocked-zone shading probes the sim's OWN flight walks (`sprayBlocking` → `flightBlockedBy`
  for trees — the path `flightKnockdown` delegates to — plus `tentFlightHit` when trade tents are
  armed) with px-derived sliver/merge smoothing — never fork the walks, never hard-code a px size
  into the sim. A line is shaded BINARY (GS-spray-block-2): clear when every landing in the window
  flies over, else blocked from the object to the cone's FAR edge — never a floating mid-cone band. The
  blocked-zone marker glyph is keyed to the WORLD archetype (`TREE_GLYPH` mirrors `styleFlora`: oak/mushroom/
  conifer/saguaro/…) so it matches the silhouette drawn — a fixed 🌲 stamped phantom pines on lyra's oaks;
  tents stay ⛺. Turf
  bases still emit `#3f8c3f`/`#5fd45a` (the holeView fill test). Weather/
  atmosphere is the shared screen-space `render/weather.ts`. **Per-world identity is table+dispatch,
  never a fork (GS-biome-feel):** flora (`styleFlora`), boundary markers (`OB_LOOK`), signature decor
  (`archetypeDecor`, own seeded stream per the cetus pattern), ambient air (`AMBIENT`) and wind tint
  (`WIND_RGBA`) are ALL archetype-keyed — a new world adds a row to each (`tests/biome-identity.test.ts`
  guards full coverage), and a flora variant must consume EXACTLY the classic two rng draws (extra
  variation via `posHash`, never the stream). `playView`'s `spawnLandFX` answers the touchdown per
  lie/penalty — extend it with any new penalty kind. Re-shoot the gallery
  (`node scripts/gallery.mjs`) after any `style.ts` change.
- **Audio** (`docs/decisions/audio.md`). ASSETLESS, always (GS-audio-2): every cue + music note is
  synthesized WebAudio — no downloaded audio file, ever (nothing to 404; the bundle stays one
  inlined file). ONE shared `AudioContext` (`audio.ts sharedAudioContext`), two independent
  buses/settings: SFX on `sound`, generative music on `music`. Strikes are voiced per club FAMILY
  (`strikeClassOf`, convention-based on CLUBS ids — beware `PW/GW/SW` end in 'W' but are wedges);
  touchdowns per SURFACE + tree hits per ARCHETYPE (GS-audio-3: `landVoiceOf` mirrors
  `spawnLandFX`'s dispatch, `treeVoiceOf` mirrors the flora table — coverage machine-checked;
  fired via the play view's `onLand` feel hook). A hazard with its OWN surface voice (splash/sizzle/void/
  whale) does NOT also play the terminal `sfx.penalty` "wah" — that stays for SURFACELESS penalties (OB /
  lost with no `landVoiceOf`), else the ball played both the new splash and the old wah (the doubled-sound
  bug). And a lost-rough (void/cetus) ball that lands SAFE then rolls off into the abyss fires its lost-ball
  FX+voice at REST, not on the safe fairway landing (`penaltyAtRest` in playView, GS-cetus-water). guard redirects
  sound both beats via `onRedirect` (GS-audio-4: laser pew/zap, boomerang whir/crack — the fire
  cue's `travelMs` folds in the slow-mo so the whir ends at the hit);
  music is table+dispatch per archetype (`MUSIC_TRACKS` + `'menu'`; coverage, distinct moods and
  the subtlety gain bar ≤0.35 machine-checked by `tests/audio.test.ts`) on a PRIVATE seeded stream
  — never `Math.random`, never the sim/render streams. The sim never calls audio; the audio
  modules must import clean in node.
- **UI layer** (`docs/decisions/ui-intro.md`). The screen flow is a PURE reducer (`ui/game.ts`):
  `(UiState, Action) → UiState`, no DOM/time, fully unit-tested. `app.ts`/`main.ts` render state +
  dispatch; save persistence + canvas mounts + the intro cinematic are side-effects there, never in
  the reducer. Visual theme is the design-token CSS in `index.html`, not the SVG layer. The play
  screen is full-bleed (the map IS the screen) and never scrolls; the pull-to-power gesture is the
  only shot input. **The settings cog rides EVERY screen** (GS-settings-nav: appended once in
  `render()`, never per-screen; the full-bleed play view's map stack carries its own), and the
  sheet's "Return to title" (`toTitle`) is NON-destructive: an underway run (active + characterId)
  parks as a `resumable` snapshot. `persist()` snapshots the live run only when one is underway,
  else passes `state.resumable` through — NEVER snapshot the title's character-less placeholder run
  (it wipes saves). Character select fits ONE screen in every mode (2×2 phone grid; small screens
  swap blurb+pros/cons for a one-line hint via CSS visibility, not a template fork; the CTA verb
  follows the format). **Ascension is picked WITH the golfer** (GS-title-2): the difficulty chips
  live on character select (`[data-asc]` view state → `selectCharacter.ascension`, reducer-clamped),
  never on the title. **The stop intro is TWO mobile steps (GS-intro-split), one reducer screen
  (`'intro'`) toggled by view state `introStage` (`'arc'`→`'hole'`), reset to `'arc'` on entry —
  no new screen/save/rng:** step 1 (`arcIntroScreen`) is the MODE + the field of competitors, with a
  big "First Tee ▸" up top and a second one at the bottom shown only when the field overflows a screen
  (`render()` measures `scrollHeight` post-rAF), plus "Change golfer" → the new `backToCharacter`
  action (intro→character, no run rebuild); step 2 (`holeIntroScreen`) is the HOLE — a viewport-capped
  map (`.gs-holeintro-map svg{max-height:44vh}` so it holds one screen) + a tap-to-open hazards/benefits
  popup (`introTraitsOverlay`, the settings-sheet pattern; `data-introtraits` open/close) + Tee Off /
  Watch AI / Back. `introShared()` derives the world/notes/objective ONCE so the two steps never drift.
  Exception (GS-intro-endless): the Unending Universe past stop 0 opens on `'hole'` — the arc briefing
  duplicated the result screen's round summary on every route jump; it stays one "‹ Briefing" tap away.
  **The post-stop recap (`resultScreen`, GS-result) is built to the SAME bar as the intro:** a
  rarity-framed `.gs-panel.gs-result` (border/glow off `rarCol`/`rarityFlavour`) with a verdict badge
  over the world you just played (`zoneProfile`, mirroring the arc head), big `.gs-result-stat` tiles
  (Stableford/gross/cut-or-place/credits), the round HOLE-BY-HOLE (`roundStrip` — a clickable
  `.gs-round` strip tinted by the `holePips` palette, `viewHole` drives the framed replay), then the
  standings + a full-width Continue. The Unending Universe keeps its `endlessScoreCard`/records board.
  Pure render off `state` (no rng/save); the old collapsed `<details>` scorecard is retired.
  The title (GS-title-2/-3) is a centred hero wordmark + two GAME tiles that
  REUSE the Market/Clubhouse doorway component (`.gs-navtile--game`: whole tile = the button,
  painted-scene art + title + ONE-line caption, distinct only via the `--mc` accent — never regrow
  badges/launch bars/progress text on them), data-driven off
  `FORMATS`; the Daily button is parked off the title for now. **`app.ts` is a 3,400-line god-file — the likeliest source of
  regressions; prefer extracting a module over growing it, and re-read the relevant span before
  editing.**
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
