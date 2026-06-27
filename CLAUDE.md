# Golf Stars — working notes for Claude

A travelling space golf **RPG**. You voyage the galaxy; each stop is a procedurally-generated,
ever-wilder golf course (rarity-graded loot). Play it, earn rewards, upgrade your bag/ship/perks,
travel further as difficulty and absurdity scale. A **game**, not a tracker — its currency is
*feel, fairness, and progression*, the opposite of a realism app.

This project was seeded from `golf-finder` (a separate, real golf+astronomy PWA). We harvested its
golf simulation, rarity/card system, hole renderer, and Flux art pipeline — then cut all of its
real-world plumbing (GPS, OSM, weather, real astronomy). **The two projects are independent. Do not
re-couple them.**

## How to work with me (ground rules)
- **Pressure-test my ideas before building them.** If an idea is sound, say so and go. If it
  isn't, push back — question the premise, propose a better alternative, or say "that's not a
  great idea, Dave." A cheerful "yep!" followed by a half-working result is the worst outcome.
- **Implement properly or stop.** If you can't do something well, stop and ask for context or take
  the time to do it right. A "this can't be done cleanly because X — here's what I'd do instead"
  is always welcome.
- **Promote durable knowledge into the repo.** Memory is a private scratchpad; CLAUDE.md, skills,
  and docs are the shared record. When you learn a gotcha or recipe, write it here too.
- **Be concise, factual, accurate.** State what was verified vs. assumed.
- **Front-load everything; don't drag the session out.** Give all options in one pass; only ask a
  follow-up when the answer changes what you do — otherwise pick the sensible default and say which.

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
  bug even if the physics are "right." (This is the inverse of golf-finder's realism dogma — here,
  fun and fairness beat literal accuracy.)

## Architecture (the decisions we locked up front — see STARTER-KIT for why)
- **Vite + TypeScript, modules, real test runner.** No single-file monolith.
- **Sim ↔ render split.** Everything in `src/sim/` is pure, DOM-free, deterministic, no globals —
  so Node/vitest can simulate the whole game. Rendering reads sim state; never the reverse.
- **Deterministic seeded RNG only** (`src/sim/rng.ts`). `Math.random()` is banned in the sim — it
  breaks reproducible runs, daily seeds, and test determinism.
- **Course contract** (`src/sim/course/contract.ts`) is frozen: the generator emits it, the
  renderer consumes it, the sim scores it. Rewrite either side freely behind the contract.
- **Versioned saves from v1** (`src/save/schema.ts`): every persisted blob has a `version` +
  `migrate()`. Namespace keys `gs_*`. Export/import-to-JSON exists from day one (localStorage is
  the only copy). [Lesson inherited from golf-finder's painful schema migrations.]
- **Content as data, not code:** clubs, lies, biomes, items, economy are tables the sim reads.
  New biome = new row, not an engine edit.

## Generator & sim invariants (locked in GS-1)
- **Biomes are data** (`src/sim/course/biomes.ts`): a biome row sets gravity (carry mult),
  wind, hazard kinds, scatter surfaces, corridor tightness, dogleg bias, **`treeDensity`** and
  **`fairwayBunkers`** (GS-13). New world = new row. Render palette is keyed by biome id in the
  render layer (the sim biome table is physics-only).
- **Fairway shape = wide-and-wild early → tight late, with variable thickness + doglegs (generator v4).**
  Three coupled levers in `generateHole`: (1) `widthScale = 2.0 − 1.25·wildness` lerps the corridor
  half-width from generous early (2.0×) to the OLD constant (0.75×) at wildness 1 — so early stops
  are far more forgiving while the max-wildness balance scale is unchanged. (The intercept was raised
  1.6→2.0 after a spray-feel check: even a beginner driver's cone is an honest ±80% "green zone" ~38yd
  wide, which overflowed the old ~33yd early fairway — a centre-aimed beginner tee shot held the
  fairway only ~60% of the time, so a green-zone shot still felt like a miss. The wider early corridor
  lifts stop-1 fairway-hold to ~67% so the green zone reads true on grass; the wildness=1 slope is
  unchanged at 0.75 so the death-spiral bar still holds.) (2) The corridor is built
  from a **densified** centreline with a per-point half-width (`corridorPoly` now takes a number OR a
  per-point array): a seeded sine wave + one localized pinch undulate the thickness (wide landing
  zones, the odd neck), amplitude early-heavy (`ampFrac = 0.18 + 0.32·(1−wildness)`) so calm holes get
  the wildest variation and brutal holes flatten toward a uniform-but-tight strip. (3) Doglegs bend
  left/right (`bendSide`) even on calm stops via a wildness floor (`doglegFactor = 0.35 + 0.65·wildness`)
  — the old `×wildness` made every early hole dead straight; at wildness 1 the severity is unchanged.
  CRITICAL: hazard placement + `validateFairness` both reason about the corridor's WIDEST point
  (`fairwayHalfWidth = max(halfWidths)`, matching `fairwayHalfWidthOf`'s max-lateral recovery), so
  penalty hazards still clear the widest part and stay provably fair. The death-spiral bars run at
  wildness 1 ONLY — keep that case ≥ as easy as the old constant (it is) and the bar holds (verified
  toPar/hole ≈ 0.12 ≪ 1.0).
- **Hole SHAPE is a biome-biased template grammar (GS-shapes, `buildCentreline`).** Layouts stopped
  feeling identical: the centreline is no longer the old single `[tee, mid, green]` bend but a SMOOTH
  curve from a drawn template — straight drift / single dogleg L-R / S-curve double-dogleg — picked by
  biome + wildness (`straightP`/`sP` from `doglegBias`; a calm verdant world leans straight, a chaotic
  inferno/void bends more), with bend severity `doglegBias × (0.35+0.65·wildness) × length` capped at
  `0.4·length` so an offset corridor doesn't self-cross. Control points are smoothed (`smoothCurve`,
  Catmull-Rom) so the corridor follows a real arc. EVERYTHING downstream derives from this centreline
  (hazards/scatter via `centrePoint`+`perpAt`, the green = its last point), so the old `mid`/`midY`
  hazard math is gone. CRITICAL: the centreline is now N points (a smoothed curve), so BOTH the
  generator's `centrePoint` AND the sim's `round.ts` `pointAlong` are arc-length over N points (the old
  2–3-point hardcode is removed) — keep them in lockstep. EXCEPTION: a lost-ball ISLAND (void, lostRough
  armed) stays a STRAIGHT honest target — a dogleg over the abyss pushes the AI's line off the island
  and shreds balls (measured toPar/hole 1.81 ≫ 1.0 with bends; straight keeps it ≤ the old ~0.96). The
  death-spiral bars held for every OTHER world at max wildness (the doglegs didn't blow them) — re-run
  after any `buildCentreline` change, and re-shoot the gallery (curves can self-cross if the cap loosens).
- **Fairness by construction:** penalty hazards (water/lava/void) are kept CLEAR of the tee→green
  play corridor — `validateFairness()` proves it and `generateCourse` throws if violated. The
  *spice* is in-play non-penalty lies (ice = slick/high-dispersion, crystal = true/low, low-grav =
  longer carry) plus tighter corridors, doglegs, and wind. "Wild but fair."
- **Trees & fairway bunkers are NON-PENALTY (GS-13).** Trees are a tough LIE (`trees`: carry 0.6,
  dispersion 1.7) — a sprayed ball punches out, never loses a stroke — so they need no corridor
  clearance; the generator still lines them in the rough OUTSIDE the corridor (only an offline shot
  finds the woods). Fairway sand bunkers bite the landing-zone edge (sand is always fair). Both are
  drawn as glyphs/sand, trees as canopies (not flat blobs) in both renderers. Because they're
  non-penalty `validateFairness` ignores them, but they DO make scoring harder — keep them off the
  centre line and re-run the no-death-spiral test (`toPar/hole < 1.0`, blow-ups < 5%) after tuning.
- **Greens are VARIED organic shapes, NOT circles (GS-greens, `generate.ts`).** `greenPoly` builds the
  putting surface from a few seeded harmonics + an optional kidney lobe, stretched along a random long
  axis — so greens come as blobs, kidneys, long shelves, pears and punchbowls. The per-biome row sets
  the CHARACTER (`greenSize`/`greenAspect`/`greenIrregular`): desert oasis greens big & smooth, frost
  ice-SHELVES long & narrow (aspect leaned toward the max so it reads reliably), inferno greens jagged,
  void asteroid greens small & angular, verdant classic. The green stays a STAR shape about its centre
  `green` (single-valued r(θ)), which `pinInGreen` relies on: it ray-marches from the centre out to
  22–62% of the edge distance, so the flag is always genuinely inside (never on the lip) yet off-centre
  for ANY shape — `rayPolyDist` is the shared ray↔polygon helper (GOTCHA: its edge-parameter `s` divides
  by `denom`, NOT `-denom` — the sign error placed a bunker on the pin). Greenside hazards also ray-march
  to the real green edge so they hug any shape. `validateCourse` still proves the pin is in the green.
- **The fairway WRAPS past the green, no hard flat cap (GS-greens).** Besides the main corridor, the
  generator adds a SECOND `fairway` feature — a tapering apron strip running from just before the green,
  through it, and out the back (`apronLine` along the final play direction, half-widths tapering to ~0.4)
  — so the fairway flows around/past the green instead of ending at a perpendicular line. SKIPPED for void
  ISLAND greens (lostRough armed — the green floats over the abyss). CRITICAL: it's a separate feature so
  it never widens the corridor's fairness half-width — `validateFairness`/`fairwayHalfWidthOf` key off the
  FIRST `fairway` feature (the main corridor). `lieAt` precedence (green > fairway) keeps a ball on the
  green reading green even though the apron overlaps it.
- **Wind reads true:** the round sim aims UPWIND to compensate for the known crosswind, and lays
  up to the (penalty-free) centreline when the line to the pin is blocked — a played shot reads
  trouble instead of spiralling.
- **Pin ≠ green centroid (GS-6):** each hole generates a flag (`Hole.pin`) 18–55% of the green
  radius off the centroid, from a SIDE rng (`${seed}:pin:${holeIndex}`) so adding it left every
  existing course's terrain byte-for-byte unchanged. The flag is the hole-out/putt target (a tucked
  pin = a longer putt) and the interactive **attack** aim. The auto/percentage AI and the **safe**
  line still aim at the FAT OF THE GREEN (centroid): `playHole` splits `aim = hole.green` (approach)
  from `flag = pin(hole)` (hole-out + putt), and `layupTarget` aims at the centroid too — aiming at
  an off-centre flag spilled shots off the green under max-wildness spray (toPar/hole 1.21 vs the
  <1.0 bar). Hole-out detection keys off the FLAG in BOTH `playHole` and the interactive `takeShot`
  so auto === interactive byte-for-byte (guarded). `validateCourse` rejects an off-green pin.
- **Lie read is by SURFACE PRECEDENCE, not feature draw-order (`lieAt`).** Features are emitted in
  draw order (fairway slab first, then tee/green/scatter on top), so the old first-match read let the
  broad fairway override the green that overlaps it — "it thinks you're on the fairway when you're on
  the green." `lieAt` now picks the HIGHEST-precedence feature under the point (`SURFACE_PRIORITY`:
  green 5 > tee 4 > scatter ice/crystal/waste 3 > fairway 2 > rough/default 1); hazards are still
  checked first (they dominate). This also makes scatter spice (ice/crystal) on the fairway actually
  read as that lie. Fixing it shifts the seeded balance slightly (re-validated; bars green).
- **Per-club wildness (shot dispersion):** longer clubs spray WILDER in both line and distance;
  short clubs are tight/accurate. A club's `t` ramps 0→1 from `TUNABLES.accurateCarry`→`wildCarry`
  by nominal carry; lateral σ, distance σ, and the carry clamp window all lerp short→long. At the
  driver (player hcp 18): ~±55% of carry sideways at the 2.5σ cone edge, carry 50–110% of full
  (mean a touch short) — i.e. it *can come up well short*. `dispersionProfile()` is the single
  source both `resolveShot` (samples it) and `shotSpread` (previews it) share, so the on-screen
  spray cone reads EXACTLY true. The mean carry stays near full so the reach-AI still clubs sanely
  (variance, not a mean shift) — that's why max-wildness mean-per-hole stays under the fairness bar.
- **Dispersion is ANGULAR, not a flat sideways offset (GS-mechanics #5).** The random spray is a
  small ANGLE about the shot bearing (`angleSd = prof.lateralFrac × dispMult` radians), not a lateral
  yard offset added to a straight-ahead carry. A rotation preserves length, so the ball's distance
  from the origin IS the sampled carry in EVERY direction — a wide miss can never finish past the
  carry window (the old "square box" where a diagonal exceeded max distance). Crosswind stays a
  SEPARATE deterministic lateral push (the AI aims upwind to cancel it), so wind shifts the cone, not
  its width. `ShotSpread.angleSd` is the shared truth the render sweeps the spray ARC SECTOR by. The
  rng draw order is unchanged (carry draw, then the angle draw replaces the old lateral draw) so
  auto≡interactive stays byte-for-byte. `lateralFracLong` was trimmed 0.20→0.17 because an angled
  miss now also loses forward distance (carry·cosθ) — re-tune via that, and re-run the no-death-spiral
  bar, after any dispersion change. Lie penalties: rough `carryMult` 0.90 (10%), bunker 0.50 (50%).
- **Spray is an ASYMMETRIC 5-ZONE shape, not a symmetric gaussian (GS-dispersion-2, `shot.ts`).** The
  angle off the bearing is sampled from a `SprayShape` — `green` (great shots) + four independent miss
  zones: `duckHookL`/`shankR` (red tails) and `hookL`/`sliceR` (orange flanks). The base spread `σ0 =
  prof.lateralFrac × dispMult` only SCALES the cone; the *distribution* is the shape (categorical zone
  pick → within-band angle, green triangular/centre-peaked, misses uniform). INVARIANT: `green = 1 − Σ
  misses`, so a `ShapeMod` (additive deltas to the 4 miss zones, `applyShapeMod`/`combineShapeMods`)
  that cuts a miss feeds the freed % to GREEN, never the opposite side — a sideways move needs an
  explicit zero-sum trade-off mod. This is what lets upgrades/golfers reshape WHERE a miss goes:
  **characters** carry a per-club `shape` in `ClubShotMods` (Feather suppresses the left zones + adds
  right = a baked-in fade; Huang-Woo balloons the LEFT zones on the long sticks but cleans the irons);
  **upgrades** carry a global `loadout.shapeMod` (Anti-Hook Grip/Shank Guard kill a red zone; Hook/
  Slice Corrector & Sweet-Spot trim orange/all; Draw Weighting is the trade-off). The two combine via
  `resolveShape(globalMod, charMod)` in `executeShot`/`shotSpread`. Because the shape is folded the
  SAME way in the auto sim (`playStop`→`playHole`) and the interactive driver (`takeShot`/`previewShot`),
  auto≡interactive holds (guarded). The shape sampling keeps the 2-rng-draw angle budget so the draw
  order is stable. The new model is TIGHTER than the old gaussian (hard angle cap ≈2.8σ0 vs a long
  tail), which is *safer* for the death-spiral bar — but re-run it after any geometry (`SPRAY_GEOM`)
  change. `tests/spray-shape.test.ts` guards the redistribution rule, proportional/zero-removal
  geometry, physics==graphic, and that the new upgrades raise mean per-stop Stableford.
- **Distance-control upgrades shrink the carry WINDOW (GS-dispersion-2, points 5 & 6).** A shot's carry
  clamp `[lowFrac, highFrac]` (from `dispersionProfile`) is tweakable per club: **Distance Control**
  raises `lowFrac` for driver/woods/irons (carry > `WEDGE_CONTROL_CARRY` 110) — less coming-up-short,
  a smaller min↔max gap; **Wedge Touch** pulls BOTH clamps toward the mean for wedges (≤110) — reliable
  wedge distance so it lands where you aim (the left/right placement is the existing free-aim). These
  are loadout fields (`minCarryBoost`/`wedgeWindow`), resolved per club by `carryControlFor` and applied
  IDENTICALLY in `resolveShot` (the clamp) and `shotSpread` (the previewed `carryLow`/`carryHigh`), so
  the cone's distance labels read true. They only ever tighten distance → never lower scoring (guarded).
- **Interactive suggested club = GREEN COVERAGE (`suggestPlayerClub`, GS-mechanics #6).** The player's
  🎯 suggestion is NOT the auto `aiClub` (shortest-that-reaches, tuned for balance — leave it alone):
  green unreachable → longest usable club; reachable → the LONGEST club whose **EXPECTED** carry still
  stops on the green (`expectedCarry ≤ distToBack` via `greenDepth`), so you take the most club you can
  without flying the green on a normal strike (overshoot the front is fine). Uses the same `shotSpread`
  the cone draws, so it reads true. GOTCHA (fixed): the old gate was `carryLow ≤ distToFront` — the
  club's WORST-case carry — which handed you the DRIVER for any approach long enough that the driver's
  worst miss could fall short of the front, even though its MEAN flew 60+ yds past. Gate on the expected
  carry, not the minimum.
- **Driver from the deck is a CADDY unlock (`usableBag`, GS-caddy — replaced the old Driver-on-Deck
  ladder).** The driver (`id 'D'`) is TEE-ONLY by default; the **Driver Dan** caddy
  (`loadout.driverAnywhere`) unlocks it from ANY lie at FULL driver stats (no distance penalty, no
  spray surcharge). The rule lives in ONE place — `usableBag(bag, lie, driverAnywhere)` returns the
  full bag on the tee or with Driver Dan, else drops the driver — applied by BOTH the auto sim
  (`playHole`/`PlayHoleOptions.driverAnywhere`) and the interactive player
  (`shotView`/`previewShot`/`takeShot`/club cycle), so auto≡playHole stays byte-for-byte. The old
  4-tier `DRIVER_DECK` table, `driverDeck` level, `driverDeckSprayMult`, and `driver-deck-1..4` shop
  cards were all REMOVED; `loadoutFromPerks` skips unknown ids so old saves carrying them resolve fine.
- **Out of bounds = stroke-and-distance, and now VISIBLE (GS-13).** `playBounds`/`inBounds` derive a
  generous hole-sized box around all terrain (margin `clamp(span*0.25, 40, 90)` — the cap stops a long
  par-5 flinging the boundary miles out); a shot resting beyond it is +1 and replays from the shot's
  origin. Only genuinely wild shots trigger it. The box is DRAWN as a faint dashed boundary ringed
  with white red-capped OB stakes (`obStakes`/`playBoundsCorners`, render-only) in both renderers, and
  added to the `holeProjector` `extra` fit so the edge is on-screen to aim away from. GOTCHA: the box
  doubles as the OB *trigger*, so tightening the margin to make the hole bigger on screen directly
  raises the OB rate — a `64`-cap was tried and REVERTED (tipped `toPar/hole` to 1.03, over the bar).
  Both renderers fit the ball into frame too, so a wild shot is seen flying out, not clipped.
- **Curved flight, arc height, tree-knockdown & hazard-aware roll (GS-flight, `src/sim/flight.ts`).**
  `flight.ts` is the ONE pure source of truth for ball-path geometry, shared by the sim (decides where
  the ball goes) AND the renderer (draws it) so the graphic IS the physics — a ball drawn clearing a
  tree is a ball the sim let through. Three coupled pieces: (1) **Curved path** — the flight LAUNCHES
  along the shot bearing (the aim line) and curves to the offset landing via a quadratic Bézier whose
  control sits straight ahead at the landing's FORWARD DEPTH — its projection onto the aim line, NOT
  the full carry (`flightControl(from, landing, bearingDeg)`/`flightGround`); a straight shot barely
  bows, a fade/hook/slice bows toward its finish (the banana). GOTCHA (fixed): the control USED to sit
  at full carry straight ahead, but an angled miss's landing is SHORTER in depth than its carry
  (carry·cosθ), so the control sat BEYOND the landing and the curve overshot forward then pulled back —
  the ball "slid out to the side / did a loop-de-loop" near touchdown. Projecting the control onto the
  aim line makes forward progress MONOTONIC (the lateral t² banana is identical), killing the loop. The
  lateral offset is still `resolveShot`'s angular spray — this only shapes the PATH between aim and
  landing, so determinism is untouched, BUT it changes the curve the tree-knockdown walk follows, so it
  was re-validated against the no-death-spiral bar (lateral profile unchanged → knockdown ≈ unchanged).
  The play view (`sampleCurvedFlight`) and the SVG map shot-lines (`M…Q…` paths) both draw it; the play
  view also CLEARS the aerial trail at touchdown so the banana doesn't visually kink into the diagonal
  run-out. (4) **Bounce/run-out animation (`playView`)** scales with the actual COURSE-YARD roll, not
  screen px: `rollDur = roll·rollMsPerYard` (zoom-independent) and the bounce amplitude + hop count
  scale with the run AND surface firmness (a long firm run skips tall and several times; a short soft
  check plops once) — so "landing & run match the distance travelled". Pure feel on `_gsFeel` (no new
  `_gs*` flag). (2) **Loft-scaled apex** — `arcApex(carry, nominalCarry)`: short/lofted clubs balloon (higher
  peakFrac), long clubs bore. Stored on `ShotResult.apex` so render + sim use the EXACT same arc. (3)
  **Tree knockdown** — a low ball that crosses a treeline below its canopy (`canopyHeight` ∝ blob size,
  `OBSTACLE_KINDS`) is knocked into the woods: `flightKnockdown` walks the curved path checking arc
  height vs canopy and returns the earliest clip, so ARC HEIGHT decides it (a high wedge drops over a
  guarding tree a flat borer clips). Trees are NON-PENALTY, so a knockdown costs distance (a punch-out
  from the `trees` lie), never a stroke — fair, and the ball-already-in-trees case is guarded
  (outside→inside crossing only). CRITICAL: the knockdown + the **hazard-aware roll** (`rollStop`:
  the run-out settles where it first trickles into water/lava/void or plugs in a bunker it reached,
  instead of magically rolling through) are PURE geometry done in the shared `executeShot` AFTER the
  rng draws — NO new draws — so auto≡interactive stays byte-for-byte and the rng stream is unchanged.
  `roll` is updated to the distance ACTUALLY travelled, so `dist(rest,touchdown) === |roll|` still
  holds (the roll-invariant test). These shift the seeded balance (harder: more offline shots find the
  woods/water) — re-validated against the no-death-spiral bar (`toPar/hole` 0.063 → 0.103 ≪ 1.0,
  blow-ups still 0%). `tests/flight.test.ts` guards the curve endpoints/banana, apex loft-scaling,
  canopy/knockdown arc-height logic, the broad-phase prune, and the executeShot integration. NB: these
  are pure module constants (`ARC_FEEL`/`CANOPY_FEEL`), NOT `_gs*` window flags, so the test-hub guard
  needs no new control; the play-view feel reuses the existing `_gsFeel` (apex now off `result.apex`).
- **Run-out is a SURFACE-FRICTION INTEGRAL, not a single multiply (GS-flight-2, `rollOut`).** The roll
  used to be `carry·loftFrac·SURFACE_ROLL[touchdownLie]·variance` — one surface, applied once. Now the
  ball carries a surface-FREE roll ENERGY (`rollPotential` = `carry·loftFrac·variance`, the *one* rng
  draw, signed: + runs, − is backspin check-back) and `rollOut` spends it step-by-step ALONG the path,
  consuming `STEP / SURFACE_ROLL[localLie]` energy per step — so the SAME energy runs far on
  fairway/ice and dies fast in rough, and a roll that CROSSES surfaces blends them: land in the rough
  and trickle onto the fairway and it keeps running; run off the fairway into rough and it brakes
  short. This is the "landing in the rough and running into the fairway, or vice versa" ask, and it's
  what makes a DOGLEG real — a straight over-carry that lands fairway near the bend runs straight off
  the outside into rough (emergent, not special-cased). Hard stops: it settles where it first trickles
  into a penalty (water/lava/void), or plugs in a bunker / is caught by trees it ROLLS into (ground
  object-interaction). `SURFACE_ROLL` is now a per-yard run multiplier (rough trimmed 0.5→0.42 for the
  per-step model); the forward/back caps (`MAX_ROLL`/`MAX_CHECK`) clamp the final distance. CRITICAL:
  `rollOut` is PURE geometry after the single energy draw — no new rng — so auto≡interactive stays
  byte-for-byte and `dist(rest,touchdown) === |roll|` still holds (roll = the distance ACTUALLY
  travelled). Balance-neutral (re-measured `toPar/hole` 0.103 → 0.1025). The renderer reads the
  TOUCHDOWN surface (new `ShotLog.landLie`) for a FIRMNESS-scaled bounce (`SURFACE_FIRMNESS`): a firm
  fairway/ice skips tall and runs (more, higher hops), thick rough/sand plops dead (a low, fast-damped
  hop). `tests/roll-surface.test.ts` guards the run-on/brake asymmetry, the transition blend, the
  bunker catch, the roll invariant, and the firmness ordering; firmness/`rollOut` are pure (no `_gs*`).
- **Blow-ups are absorbed, not eliminated:** at max wildness rare disaster holes still happen;
  Stableford caps them at 0 points so they don't wreck a run (that's *why* Stableford is the
  headline metric). Tests assert no *systemic* death-spiral (sane average, <5% blow-ups), not a
  hard per-hole cap. Tightening the short-game AI to shrink the tail is GS-4.
- **Per-world SIGNATURE mechanics, scaled fair→brutal by wildness (GS-19).** Two worlds break the
  baseline "rough is a safe recovery / no penalty on the corridor" model on purpose — both are pure
  DATA opt-ins on the biome row (`lostRough`, `lavaRiver`), gated by a wildness threshold so a calm
  stop plays fair and a deep one bites:
  - **Void = lost rough (`void-garden.lostRough: 'voidrough'`).** There is no rough in the void —
    off the fairway is the abyss. Past `LOST_ROUGH_MIN_WILDNESS` (0.55) the generator (a) arms a
    `roughLie` biomeMod that `lieAt` returns for any OFF-feature point (so a sprayed ball reads as
    the `voidrough` PENALTY) and (b) widens the corridor to a generous `VOID_ISLAND_SCALE` (2.4×,
    constant — does NOT shrink with wildness) so the island is an honest, big target. The penalty is
    a NON-replay drop-back-on-the-island (`voidlost`), NOT stroke-and-distance: a true s-and-d
    cascade made max-wildness void a ball-shredder (toPar/hole 2.1, ~1 lost ball/hole); the +1 drop
    keeps it brutal-but-FAIR (toPar 0.96, ~0.5 lost/hole — the hardest world, still under the bar).
    Below the threshold the void renders as space but plays as ordinary rough (fair early). The
    visual is "space" either way; only the penalty is gated.
  - **Inferno = lava rivers (`ember-world.lavaRiver: true`).** One molten band (`kind: 'lavariver'`)
    crosses the corridor on a par-4/5 as a FORCED CARRY, past `LAVA_RIVER_MIN_WILDNESS` (0.3),
    thickness ramping with wildness but capped relative to the hole. It's a PENALTY on the play
    corridor, so `validateFairness` EXEMPTS `lavariver` and a separate `validateCrossings` PROVES
    each one carryable: the centreline genuinely enters+exits it, with a penalty-free shelf BEFORE
    the near bank (lay up short) and just AFTER the far bank (land the carry). One river per hole
    (two close ones leave no safe shelf between).
- **Carry-aware AI (GS-19, `safeTarget`/`layupTarget`).** A forced carry needs an AI that flies it.
  When the line is blocked, `safeTarget` now distinguishes a CENTRELINE-crossing penalty (a lava
  river) from a side hazard: it CARRIES the river (aims at the furthest penalty-free point past the
  far bank within reach — flying over a hazard is fair, only RESTING in it costs) or, if it can't
  clear it in one, lays up SHORT of the near bank; a side hazard still lays up onto the centreline
  (unchanged). `maxReach` is derived deterministically from `(bag, lie, carryMult)` and threaded
  IDENTICALLY through `playHole` and the interactive `layupTarget` (play.ts), so auto≡interactive
  stays byte-for-byte (guarded on ember+void at wildness 1). For every non-river/non-void hole the
  logic is unchanged — `cross` is null, so it's the OLD layup-to-centreline (all existing tests are
  byte-identical). NB: penalties apply where the ball RESTS (touchdown/roll), never mid-flight, so a
  river is automatically a forced carry the moment the AI stops laying up into it.

## RPG meta-loop (locked in GS-2)
- **The spine** (`src/sim/rpg/run.ts`): `startRun → [playStop → buy* → travel]*` until a cut
  is missed. Pure/deterministic — a seed plays the same run; `simulateRun()` drives a whole run
  headlessly for tests.
- **Fail gate = the cut line** (`economy.ts`): each stop needs a minimum Stableford that ramps
  with galaxy distance. Beat it to travel on; miss it and the run ends. Reuses the score we already
  compute — and guarantees runs terminate. Credits (from Stableford) buy one-shot shop perks.
- **Route events make travel a decision (GS-14, `events.ts`).** A jump used to differ only by
  distance; now each route carries a themed, content-as-data **event** that tilts the stop you fly
  *into* — two pure levers: `creditMult` (payout) and `cutDelta` (the cut/fail gate). The spread runs
  from calm (easier cut, modest pay) to high-stakes (credits double, cut +2/+3); `routeOptions` draws
  3 distinct events seeded + rarity-weighted and **always guarantees one calm option** (an out). The
  chosen event rides `run.pendingEvent` (set by `travel`), is applied by `finishStop` via
  `effectiveCut()` + the credit mult, then **cleared** there so a resume can't double-apply it
  (`RunSnapshot.pendingEventId` round-trips it). Stop 0 / no-event = the neutral `DEFAULT_EVENT`, so
  existing stop-0 behaviour is byte-for-byte unchanged. CRITICAL: events touch ONLY economy/cut, NEVER
  course generation — that's what keeps the fairness + no-death-spiral validators untouched. Keep it
  that way; a "wilder course" event would have to re-clear those bars.
- **Loadout is rebuilt from owned perks** (`loadoutFromPerks`): the save stores the perk *ids*, not
  the derived bag/mods, so `resumeRun(snapshot)` reconstructs it. Keeps the save version-stable.
- **Playable golfers (GS-18, `characters.ts`).** A character-select step (a `'character'` UI screen
  between format pick and intro) lets you choose 1 of 4 golfers, each a clear strength + clear quirk
  so the loop FEELS different per run. Two pure levers, both CONTENT AS DATA: a `loadout(base)` tweak
  (bag distance via `boostDistanceClubs`, global `dispersionMult`/`handicap`) and a per-club
  `clubMods(nominalCarry) → {dispMult, angleBias, rollFracDelta}` SHAPE function. The shape adds the
  new mechanic — a directional **shot bias**: `angleBias` (radians, + = fade/right, − = hook/left)
  shifts the MEAN of `resolveShot`'s SAME angular spray draw (not its width, no extra rng → a 0 bias
  is byte-for-byte identical to before), and `shotSpread` rotates the preview cone by it so the
  fade/hook READS TRUE (aim left to hold a fade — wind-reads-true philosophy). `dispMult` is per-club
  (Huang stripes irons but sprays the driver), `rollFracDelta` feeds `rollYards` (Bo back-spins the
  scoring clubs to hold greens). Roster: **Feather Fade** (tidy fade, tighter overall), **Huang-Woo
  Hook** (surgical irons, hooky wild driver), **Longshot Larry** (+14yd distance clubs, more
  orange/red), **Backspin Bo** (backspin from 5-iron down, shorter tee). The `ShotMods` function is
  resolved from `loadout.characterId` at the run boundary and threaded into BOTH the auto sim
  (`playStop`→`playHole`→`executeShot`) and the interactive driver (`takeShot`/`previewShot`) so
  auto≡interactive stays byte-for-byte (guarded). Distance is done via BAG edits (not a carry
  multiplier) so the reach-AI clubs correctly and never overshoots (the power-cell lesson). The
  golfer rides `run.loadout.characterId` → `RunSnapshot.characterId` (re-applied on resume by
  `applyCharacter`, so NO save-version bump). Balance: all 4 stay within ~5% of the characterless
  mean per-stop Stableford and clear the no-death-spiral bar — `tests/characters.test.ts` guards
  viability, the cluster band, the shapes are real, byte-for-byte determinism, and snapshot/resume.
  Render: `style` is render-only metadata (cap/skin/shirt/build); the play-view `drawGolfer` takes a
  `GolferLook` (so the on-course swinger wears the chosen golfer's colours), the select card draws an
  inline-SVG silhouette, and the header shows the name. The Sim Lab (`lab.ts`/hub) gained a golfer
  selector so the shape is demoable (dispersion scatter + scoring harness); `CHARACTERS` is in the
  test-hub guard's imported-tables list so the roster can't fork.
- **Per-character starting bags + clubs as rewards (GS-clubs, `characters.ts` + `economy.ts`).** Each
  golfer starts with a SPARSE, SIGNATURE bag (8–10 clubs, NOT the full 27-club taxonomy) from
  `STARTING_BAGS`: their identity clubs (Feather's hybrid+fade kit, Huang's two hooky woods, Larry's
  Driver+long-irons, Bo's short-iron scoring kit) PLUS a fair short-game ladder. **The short-game ladder is
  non-negotiable for fairness:** a literal "5 signature clubs" bag (one wedge, then a ~98-yard gap to
  the putter) death-spirals — measured toPar/hole **~2.2** at wildness 1 (≫ the old 1.0 bar) and ~halved
  Stableford, because the reach-AI has no touch club and hits a PW that flies 106 at a 60-yard chip.
  Adding the wedge ladder (SW/LW/60) drops toPar to ~0.9 and restores scoring — the short game, not the
  long clubs, is the dominant lever (long sparseness just costs a lay-up). **The sparse bag legitimately
  raises the max-wildness MEAN toward bogey (~0.9–1.0/hole) — that is BY DESIGN, not a death spiral:**
  the blow-up (≥+5) rate stays ~0%. So the no-death-spiral guard for golfers is now a relaxed toPar bar
  (< 1.15) PLUS a strict blow-up bar (< 5%), and the balance test baselines against the ROSTER mean (the
  neutral full bag is a different game). Collecting clubs over a run closes the gap. **Clubs are LOOT.** A
  reward club is a `ShopItem` (`CLUB_ITEMS`, GENERATED from `CLUB_SETS` × `REWARD_CLUB_TYPES`) whose
  `apply()` `equipClub`s it into the bag — replacing the club of that TYPE, or adding it (bag holds ONE
  per type, kept sorted longest→shortest). Each bag `Club` now carries optional `set`/`rarity`. Ownership
  rules (`offerableClubs`): a type you LACK → offered (fill a gap); a type you OWN → offered only as a
  HIGHER tier (upgrade) or a same-tier DIFFERENT set (side-grade), never the one you hold. Starting clubs
  are the common `starter` set, so the offer never re-sells one you have — Larry (starts with a Driver) is
  offered no common Driver but a common 3-Wood; Bo (starts with a 3-Wood) the mirror. The `tour` rare tier
  is **DISTANCE-club ONLY** (`distanceOnly`): extra carry only HELPS on the woods (reach); on a scoring
  club it OVERSHOOTS the green and scores worse (the power-cell lesson — verified, so `buildRewardClub`
  suppresses the carry bonus on scoring clubs AND the tour set skips them). Scoring-club upgrades need a
  different stat (per-club dispersion/effect) and are a documented follow-up. **Larry never sees hybrids**
  (`loadout.noHybrids`, the offer filters `isHybridType`). **Driver Dan gates on OWNING a driver** (not
  on being Larry — he qualifies from the start but Dan still only shows at his epic rarity): `shopOffer`
  drops `driver-dan` unless the bag has a `DRIVER_ID` club. **Save-stable:** the bag is NOT serialised —
  `loadoutFromPerks` rebuilds it from the character's starting bag (via `startingLoadoutFor`) + the bought
  club perk ids, applied in purchase order so the latest tier wins. **`distanceClubBonus`** on the loadout
  is the running flat carry bonus on distance clubs (character ±, set by the golfer; Tour Bag +6/level,
  set by meta) so a reward distance club bought mid-run inherits the same bonus the starting distance
  clubs carry. CRITICAL ORDERING: `startingLoadoutFor(meta, characterId) = applyMeta(meta,
  applyCharacter(characterId, startingLoadout()))` — character FIRST (sets the sparse bag), meta SECOND
  (Tour Bag boosts THAT bag, not a discarded default); `startRun`/`resumeRun`/the Sim Lab all use this one
  helper so they reconstruct identically. The shop screen (`app.ts`) renders the reward clubs under a
  "Reward Clubs" sub-section (`clubOffer` drawn alongside `shopOffer` from its own RNG stream). The Sim
  Lab gained a "Reward clubs" toggle group so club builds are demoable. `tests/club-rewards.test.ts`
  guards ownership/hybrid/driver rules, equip/replace, the distance-bonus inheritance, snapshot/resume,
  and that coverage + distance upgrades raise the roster mean Stableford. **Deferred:** location-specific
  legendary sets with game effects (the Tarantula Network's Spyder putter — one `CLUB_SETS` row each).
- **Persistent meta-progression (GS-12, `meta.ts`):** runs bank **Star Shards** (`shardsForRun` =
  distance×3 + stops×2, floored at 1) in **save v3**, spent at the Outpost on PERMANENT, leveled
  *starting* upgrades (`META_UPGRADES`: Veteran Hands −2 hcp, Tour Bag +6yd, Steady Grip −4% spray,
  Deep Pockets +40 credits) at a geometric shard cost. `startRun(seed, fmt, meta)` bakes them into
  the starting loadout/credits (`metaStartingLoadout`/`metaStartingCredits`); shop perks rebuild OVER
  the meta base (`loadoutFromPerks(perks, base)`), and the run snapshot carries `meta` so resume
  reconstructs both layers. Two currency layers: **credits** = per-run (reset each run, shop perks);
  **shards** = cross-run (permanent upgrades). Save v3 migrates v2→v3 (drops the dead always-0
  `credits` field) via the one-step-at-a-time `migrate` chain.
- **The shop is a rotating, stacking outfitter (GS-11).** Two item kinds in `SHOP_ITEMS`: *uniques*
  (the original 5, buyable once) and *stackables* (`stackable: true`, buyable repeatedly at a
  geometric cost ramp — `itemCost(item, owned) = cost * STACK_COST_GROWTH^owned`, capped by
  `maxStacks`). Stacking falls out of `apply()` folding once per owned copy, so `perks[]` is now a
  **multiset** (dupes allowed) and `loadoutFromPerks` rebuilds the stacked loadout on resume — save
  v2 is unchanged. The per-stop stock is `shopOffer(run)`: a seeded, rarity-weighted draw (`RARITY_C`
  weights → rarer = scarcer) of `SHOP_OFFER_SIZE` items, deterministic from `${seed}:shop:${stop}`,
  with maxed items (owned uniques / capped stackables) filtered out. `buy()` stays the economic
  primitive (NOT offer-gated, so the headless sim can buy anything); the UI bounds choice to the
  offer and fixes it on shop entry (`UiState.shopOffer`) so buying never reshuffles the cards. This
  closes the old "dead shop after ~5 stops while the cut-line keeps ramping" progression hole.
- **Balance/test on mean per-stop Stableford, NOT full-run distance.** Distance is chaotic: a
  loadout change perturbs the whole downstream seeded-RNG stream and the cut is a hard threshold,
  so "travels further" isn't monotonic even when a perk clearly helps. Averaged per-stop score is
  the stable signal.
- **A power-up must improve scoring** (game-feel). `power-cell` boosts *distance clubs only* —
  boosting every club made the "reach" approach AI overshoot greens and score *worse*. Verify any
  new perk raises mean per-stop Stableford before shipping it. NOTE: under the per-club wildness
  model, raw distance is double-edged (longer club = wider spray), so `power-cell` also carries a
  small −5% dispersion bonus to stay a genuine upgrade. `tests/run.test.ts` guards the invariant
  (and `tests/shop.test.ts` extends it to the stackables: forgiveness/skill stacks must raise mean
  per-stop Stableford, `range-booster` must never lower it, `fortune-chip` is pure economy). The
  scoring harness must club shots with **`netDispersion(loadout)`** (handicap × equipment), not raw
  `dispersionMult` — else handicap perks like Caddie Lesson are invisible to the test.

## Caddies (GS-caddy) — named, UNIQUE hires with signature powers
- **Named caddies are a unique class of shop item (`ShopItem.caddy: 'named'`).** You may hire only
  ONE. They are RANDOM, rarity-weighted inclusions in the rotating offer (`shopOffer`) — NOT a
  dedicated row — and because they're epic/legendary they're scarce. The moment you hire ANY named
  caddy, NO named caddy appears in the shop again: `shopOffer` filters `caddy === 'named' && hasCaddy`,
  and `app.ts` also drops the others from the already-fixed offer on the next render. Exclusivity is
  also enforced in `buy()` (a second named caddy is a no-op). Rarity is epic or legendary by ability
  strength: **Penelope Putter** (`auto-caddie`, legendary — auto-putt; id kept for save-compat),
  **Driver Dan** (`driver-dan`, epic — `driverAnywhere`, see the driver bullet), **Dr Chipinski**
  (`dr-chipinski`, epic — `chipInBoost` 0.33), **Space Ducks** (`space-ducks`, legendary — left-side
  guard), **Convict Sheep** (`convict-sheep`, legendary — right-side guard). Helpers: `NAMED_CADDY_IDS`,
  `isNamedCaddy`, `namedCaddyOwned(perks)`.
- **Generic caddy 'service' perks gate behind hiring a named caddy.** `caddie-lesson` is `caddy:
  'service'`: `shopOffer` only surfaces a service perk once `namedCaddyOwned(perks)` is set — you need a
  caddy before they'll give you lessons. (It still stacks/works exactly as before once unlocked.)
- **The guard caddies redirect a sampled miss to the green MID-FLIGHT — they do NOT reshape the spray
  (`CaddyGuard` in shot.ts, distinct from `ShapeMod`).** The cone still shows the miss tails; what
  changes is that a shot already SAMPLED into a tail gets knocked back. `resolveShot` classifies the
  sampled angle's zone (`classifySprayZone`) and, if a guard is present, `remove` zones are ALWAYS
  redirected to a fresh green-band angle, `halve` zones with a 50% roll. **Space Ducks** =
  `{remove:['duckHookL'], halve:['hookL'], kind:'laser'}` (no duck-hooks; 50% of hooks saved);
  **Convict Sheep** = `{remove:['shankR'], halve:['sliceR'], kind:'boomerang'}` (the right-side mirror).
  On a redirect, `ShotResult.redirect = {kind, fromZone, originalLanding}` records the would-be miss so
  the renderer animates it. CRITICAL determinism: the guard's extra rng draws (the 50% roll + the green
  resample) fire ONLY when a guard is present AND the sampled zone qualifies — a guard-less shot (or an
  empty guard) draws NOTHING extra, so the base sim is byte-for-byte unchanged (guarded by
  `tests/caddies.test.ts`). The guard is threaded into BOTH the auto sim (`playStop`→`playHole`→
  `executeShot`, `PlayHoleOptions.guard`) and the interactive driver (`takeShot`) so auto≡interactive.
- **Dr Chipinski adds a chip-in chance, not a spray change (`ExecOpts.chipIn`, `CHIPIN_RANGE` 8yds).**
  After a shot comes to rest, if `chipIn > 0` AND the club is a wedge (`nominalCarry ≤
  WEDGE_CONTROL_CARRY` 110 — PW and shorter) AND the ball rests within `CHIPIN_RANGE` of the flag but
  outside the auto hole-out radius, one rng draw `< chipIn` holes it (`log.chipIn = true`, ball moved to
  the cup). Gated on `chipIn` + proximity + wedge, so a base loadout never reaches the draw → byte-for-
  byte stable. Lives in `executeShot` so auto≡interactive. (NOT a flat 33% on every wedge — that would
  break the birdie/eagle balance; it's a chip-in near the pin.)
- **Render (`render/caddyArt.ts`, eyes-on feel).** The hired caddy is drawn as a self-contained Canvas2D
  figure (house "no asset" style) in the play-view's bottom-left corner the whole hole, and beside the
  putt meter while putting (`PlayViewOptions.caddyId` / `PuttMeterOptions.caddyId`, both fed from
  `namedCaddyOwned`). Figures: Penelope (teal caddy + flag), Driver Dan (burly + big driver), Dr
  Chipinski (lab coat + wedge), Space Ducks (bubble-helmet duck + top hat + laser rifle), Convict Sheep
  (striped jumpsuit + boomerang). On a redirect, `playView` flies the ball toward `originalLanding`,
  fires the caddy's projectile (`drawCaddyProjectile` — laser beam / spinning boomerang) from the
  figure's muzzle anchor mid-flight, then kinks the GROUND path back to the green (the loft arc is one
  continuous parabola, so only the ground bends — the "zapped" read). All caddy feel reuses existing
  knobs/no new `_gs*` flag, so the test-hub guard needs no new control; the Sim Lab absorbs the new
  shop items automatically.

## Putting (manual pace-meter by default; auto ONLY via the Penelope Putter caddy)
- **Two putt models, one shared `PuttSkill`.** AUTO putting is the rng `onePutt` (make%/lag);
  `puttOut`/`puttOutFrom` step it; it's what the headless sim and `takeShot(…, autoPutt)` use.
  MANUAL putting is `manualPutt` — SKILL, not luck: the player controls PACE via an on-screen meter
  (`render/puttMeter.ts`, a Canvas2D side-effect like the play view), auto-aimed at the cup. Stop the
  sweeping marker inside the green MAKE band to drop it; too soft leaves it short, too firm runs past;
  a small distance-scaled lateral wobble (one rng draw) means long putts can lip out on good pace while
  short ones drop reliably. Constants `MANUAL_IDEAL_PACE`/`MANUAL_PACE_MAX`/`DEFAULT_MANUAL_BAND` are
  shared by the resolver and the meter so they agree. `takePutt(state, loadout, rng, control?)`:
  `control` (the pace) → `manualPutt`; no control → `onePutt` (the AI-finish path + tests),
  so auto stays byte-for-byte. The reducer `putt` action carries `control?: PuttControl`.
  GOTCHA (fixed): the meter's `commit()` MUST read `currentPace()` BEFORE setting `committed = true`
  — `currentPace` short-circuits to the (still-0) `frozenPace` once committed, so the old order struck
  every manual putt at pace 0 (ball never moved, stroke still counted).
- **Auto-putt is caddy-only — there is NO manual toggle.** Putting is manual UNLESS you hire the
  legendary **Penelope Putter** caddy (shop id still `auto-caddie` for save-compat; sets
  `loadout.autoPutt`), which auto-putts out on arrival. The old
  per-session `UiState.autoPutt` toggle + `toggleAutoPutt` action were removed: the `shot` reducer's
  auto gate is just `!!run.loadout.autoPutt`, so owning the caddie is the one and only "automate it"
  switch. (`» Auto-finish hole` on the decision screen still AI-plays the whole hole — that's a
  full-hole watch escape, not a putting mode.)
- **Putting is upgradeable (`loadout.puttBoost`, 0 = base).** `puttSkillOf` derives make%/lag AND the
  manual make-band width from `puttBoost` + auto-caddie; a BASE loadout returns `{}` so auto/headless
  stay byte-for-byte. Shop perks **Pro Putting Grip** (stackable) + **Tour Putter** raise `puttBoost`;
  the meta upgrade **Putting Coach** bakes it into the starting loadout. `puttBoost` is rebuilt from
  perks/meta on resume, so NO save bump. `tests/manual-putt.test.ts` guards the pace model + that the
  upgrades widen the band and sink more putts; `tests/putting.test.ts` still guards the auto model.

## Testing (regression guard)
- `tests/` (vitest) imports the pure `src/sim/` modules directly and asserts on seeded runs.
- CI: `.github/workflows/tests.yml` runs the suite on every push/PR. Keep new game logic inside
  `src/sim/` (pure) so it's reachable from tests.

## Test & demo hub (GS-16 — `test.html` / `src/test/`)
- **A second built page** (`test.html` → `src/test/hub.ts`) served beside the game on the same
  origin (`dist/test.html`). Two faces: a **Demo** that drives the REAL game in an `<iframe>` via
  its public hooks (`?seed=`, `?intro=`, and the live `window._gsFeel`/`_gsIntro`/`_gsSpray`/`_gsArt`
  escape-hatch flags set on the same-origin iframe window), and a **Sim Lab** that imports the
  pure sim for batch experiments. It re-implements ZERO game logic — it pokes the artifact. The
  full standard + a portable guard template live in `standards/` (see `TEST-HUB-STANDARD.md`).
- **The Sim Lab is the QA lens made interactive.** `src/test/lab.ts` is a PURE, DOM-free engine
  (unit-tested in `tests/lab.test.ts`) that only ORCHESTRATES the real sim and aggregates the
  result: `dispersionStudy()` fires one club N times through `resolveShot` ("hit the driver
  1000×" → scatter + carry histogram + σ/percentiles); `buildLoadout()` composes a real loadout
  from handicap + meta upgrades + shop perks (watch the cone tighten); `scoreHarness()` runs N
  seeded `simulateRun`s and reports **mean per-stop Stableford** (the balance metric — NOT
  distance). `src/test/charts.ts` is render-only Canvas2D (verified eyes-on, not unit-tested).
- **Build/deploy gotcha:** `vite-plugin-singlefile` forces `inlineDynamicImports`, which Rollup
  forbids with multiple inputs — so the two pages CANNOT build in one pass. `npm run build` runs
  vite **twice**: the game (`index.html`), then `VITE_HUB=1 vite build` (entry `test.html`,
  `emptyOutDir:false`) which APPENDS the inlined hub beside the game. `pages.yml` already runs
  `npm run build`, so the hub deploys automatically. `tests/build.test.ts` builds only the game.
- **Most changes need NO hub edit — it absorbs them.** New content as data (a club/perk/meta/lie/
  format/biome row) appears in the Sim Lab automatically (the hub IMPORTS those tables); a sim
  behaviour change (shot/dispersion/economy/scoring) is reflected because the lab calls the real
  functions; a new game screen shows in the Demo iframe because it IS the game. The ONLY thing that
  needs hand-wiring is a brand-new **hook** (a `window._gsX` flag or a `?param`).
- **The guard auto-discovers hooks, so it can't be out-run.** `tests/test-hub.test.ts` scans the
  app source for every single-underscore `_gs*` flag and every `URLSearchParams…get('x')` param and
  asserts the hub drives EXACTLY that set, both directions — add a new flag and CI goes red naming
  the missing hub control; leave a dead one and it fails too. There is no hand-maintained hook list.
  (It also asserts the hub IMPORTS the content tables, so a list can't silently fork to a copy.)
- **Process — keep the hub in sync (the I4 rule, one atomic PR):** when you DO add a hook,
  **add the hook → add the hub control → confirm the guard is green → update docs**, all in one PR.
  The `keep-test-hub-in-sync` skill (`.claude/skills/`) walks it (and tells you when you can skip it).

## Render layer (locked in GS-3)
- **One pure projector** (`render/project.ts`) does the course-space→screen mapping (tee→green
  up, fit-to-view). BOTH renderers use it so they agree pixel-for-pixel — never reimplement the
  transform. `render/palette.ts` is the shared surface/biome colour table (render-only; the sim
  never sees colour).
- **SVG = the static map** (`holeView.ts`, pure string builder, testable). **Canvas2D = the
  animated play view** (`playView.ts`), driven off the `ShotLog[]` the round sim already emits —
  arc/shadow/trail/impact/screen-shake. Keep the pure flight math in `trajectory.ts` (tested) and
  the imperative drawing thin.
- **The static WORLD is one shared, cell-shaded scene builder (`render/style.ts`, GS graphic-upscale).**
  Both renderers used to duplicate a flat draw path (every surface a single solid polygon on a flat
  rough slab — the "landing strip" look). Now `buildScene(hole, proj, {width,height,biome,art})` is the
  SINGLE source of truth: it projects the hole into a flat list of screen-space `Prim`s (poly/circle/
  line/clip) and the two thin interpreters — `scenePrimsToSvg` (pure string) and `drawScenePrims(ctx)`
  (canvas) — draw them, so the map and the play view agree. The manga/comic language: flat tone BANDS +
  a bold ink outline per surface (`SHADES` ramps in `palette.ts`, `base` = the original `FILL` value so
  the SVG still carries `#3f8c3f`/`#5fd45a` and the render tests stay green); mowing **stripes** (clipped
  horizontal bands — perpendicular-to-play after the projector rotates tee→green up) on fairway/green;
  a darker **collar** ring + lit dome on greens; lip-shadow + depression + rake lines on bunkers; concentric
  **depth banding** + shoreline + glints on water; 3-tone **cell-shaded tree canopies** (core/body/lit cap +
  cast shadow + per-tree colour/size variance); a **textured rough** (soft tone undulation + grass tufts);
  and seeded "fun/alive" accents — biome-flavoured **wildflowers**, sparkle **motes**, the odd **bird**
  (`ACCENTS` table). CRITICAL invariants: (1) all randomness is a mulberry32 seeded from `hashHole()` —
  NEVER `Math.random` — so the SVG is byte-stable (determinism test) and reads the same across reloads;
  (2) `buildScene` is node-pure — the `window._gsArt` escape-hatch is read through `artFeel()` which guards
  `typeof window`, so `renderHoleSVG` stays callable in vitest; (3) accents/tufts are placed in COURSE space
  then projected + culled to the view, so they pan/zoom correctly with the follow-cam (the canvas caches the
  scene by projector identity — whole-hole fit builds once, follow-cam rebuilds per frame). Tee + flagstick
  + OB stakes + centreline moved INTO the builder too (de-duped); the interactive overlays (spray cone, live
  ball, shot lines, HUD, animation) stay per-renderer. Canvas feel is eyes-on, but the SVG path is verified
  by rasterising a biome×seed gallery — re-shoot one after any `style.ts` change.
- **Per-ZONE turf palettes + signature visuals (GS-19, `palette.ts`/`style.ts`).** The old per-theme
  look only HUE-ROTATED the green turf — barely readable ("green fairways in no way match the themes").
  Now each of the 5 archetypes has an EXPLICIT designed turf palette (`ARCHETYPE_TURF`): desert firm
  tan, frost frosted teal/mint, inferno scorched ash-olive, void cosmic indigo, **verdant = the
  original `SHADES` values byte-for-byte** (so a themeless / verdant render is unchanged and the
  render tests still see `#3f8c3f`/`#5fd45a`). `buildScene` resolves the archetype from the theme id
  (else the biome id, via `archetypeFor`) and rarity-deepens it (`worldLook`); the stylers now take a
  resolved `Shade` instead of computing from a hue tint. Signature surfaces: lava (`styleLava` — a
  charred crust → glowing body → hot core + cracks, shared by flanking lakes AND crossing rivers) and
  the void's luminous **island glow** under the fairway/green so the platforms read as land in the
  abyss (the off-fairway IS the void). The dark per-biome rough (`roughBaseFor`) + starfield accents
  carry the "space" read. Re-shoot the biome×seed gallery (`node scripts/gallery.mjs`) after any
  palette/`style.ts` change.
- **Every course FLOATS as a landmass in a per-world deep-space sky (GS-stellar — "golf amongst the
  stars", `palette.ts`/`style.ts`).** The old look filled the whole viewport with the rough slab, so a
  stop read as a recoloured golf hole on a coloured rectangle — "samey, just a different palette". Now
  `buildScene` paints, in order: (1) an opaque world-tinted **deep-space base** + soft nebula smears
  (`ARCHETYPE_SPACE`/`spaceLookFor` — verdant blue-night, desert rust dusk, frost teal void, inferno
  ember-black, void violet abyss); (2) a **starfield** (90·`accents` screen-space stars w/ haloed
  twinkles) + the existing far planet/comet, ALL off the independent `crng` stream; (3) the **landmass**
  = a TIGHT hull around the hole geometry (the feature/hazard bbox `cb` + a small `landMargin`, NOT the
  full OB box) filled with `landFillFor` and ringed by an atmospheric **edge glow** (`SpaceLook.edge`,
  the void's island treatment generalised to all five worlds), so beyond the shoreline you see SPACE,
  not green; (4) the rough tone/tufts/flowers + a ground-star salt, **clipped to the island**. CRITICAL
  (the "too much in-bounds rough" fix): the drawn land is DECOUPLED from the OB **play-bounds box** —
  the OB box stays a deliberately GENEROUS fairness boundary (`clamp(span*0.25,40,90)`) that filling
  with rough sprawled turf to the screen edges so the zoomed play view was wall-to-wall green; the
  tighter hull lets the starfield read DURING play while the real OB box remains the (invisible) trigger
  and its stakes float out in the void (purely visual — OB/fairness untouched). And `landFillFor` blends
  the rough base 0.62 toward the space base (`LAND_SPACE_BLEND`), so the in-bounds ground is a dark,
  star-salted NIGHTSCAPE (golf amongst the stars) and the bright mown fairway/green pop against it — NOT
  a bright slab. On the whole-hole map the course floats among its stars; in the zoomed follow-cam you're
  on the dark starry ground under the same sky.
  CRITICAL determinism: the main `rng` is still consumed in the SAME order (patches→tufts→flowers) BEFORE
  the terrain/tree/water/lava draws that read off it, so their look is byte-for-byte unchanged — only the
  PAINT position moved (into the island clip); all NEW celestial scatter uses `crng`. The render tests
  hold: the background additions are theme-independent + archetype-equal, so the constellation test's
  `deepSky == plain` / `constellation > plain` count invariants and the `#3f8c3f`/`#5fd45a` turf checks
  are untouched. The stop's **constellation** (`constellationBackdrop`) was promoted from a faint corner
  motif to a large overhead **sky** drawn ON TOP of the terrain (so it's the stop's identity in BOTH the
  map and play), with the brightest star as a glowing **anchor** (Antares, Rigel…); still gated by
  `themeId` + a real figure, no rng, so a deep-sky/themeless render stays byte-identical. The play view's
  `drawSpaceFX` was enriched (40 haloed twinkling stars + the sweeping shooting star) to carry the intro's
  starfield into live play — all on the existing `_gsFeel.spaceFX` knob, no new `_gs*` flag. NB: the
  aiming overlays (spray cone, flight lines, live ball) draw AFTER `buildScene`, so the busy sky never
  occludes the shot UI. Re-shoot the gallery after touching any of this.
- **Zone splash card + procedural hero art (GS-19, `render/zoneHero.ts` + `app.ts`).** The zone
  identity now lives ONCE per stop, on the **starting zone screen** (the `intro` screen,
  `zoneIdentityHTML`) — NOT repeated per hole (the per-hole briefing splash was retired; see
  *Play-loop UX*). It leads with a thematic **hero scene** — a self-contained, deterministic SVG
  illustration per archetype (`zoneHeroSVG`: a garden dawn, a Mars dust horizon, a glacier aurora, a
  volcanic lava-flow world, the void's island past a black hole) — NO downloaded asset to 404 (the
  house rule, same as the intro). Below it: the zone NAME + signature + theme, a **difficulty** pip
  rating, the real-space INSPIRATION, a brief, and two columns of HAZARDS / BENEFITS — all pure DATA
  from `src/sim/course/zones.ts` (`ZONES`, archetype-keyed prose/profile; the physics stay in
  `biomes.ts`). The LIVE per-hole facts (wind/conditions, including an armed void lost-rough warning)
  moved onto the play screen's top stat bar. The hero SVG is `width:100%` responsive so it fills the panel.
- **Feel tunables read from `window._gsFeel`** (the escape-hatch rule) so loft/shake/trail/timing
  A/B live without touching the sim. Canvas feel can't be unit-tested — say "needs eyes-on play".
- **On-screen WIND + denser woods (GS-wind, `style.ts`/`playView.ts`/`generate.ts`).** The wind you
  read off the shot bearing is now VISIBLE: streaks blow across the hole in the wind's screen direction
  (`windScreenDir` projects `Wind.dir` through the tee→green-up projector so it reads true), themed per
  world (`WIND_COL`: inferno solar wind/embers, frost driven snow, desert dust, verdant pollen, void
  cosmic dust), with count + length scaling by `Wind.spd`. TWO layers, both off seeded streams so they
  never perturb determinism: a STATIC pass in the shared `buildScene` (`windStreaks`, off `crng`, so the
  SVG map + gallery read the weather and the constellation count invariants still hold — streaks are
  theme-independent + archetype-equal) and an ANIMATED toroidal drift in `playView` (`drawWind`, off the
  `fxRng`, on the existing `_gsFeel.wind` knob — no new `_gs*` flag, so the test-hub guard needs none).
  Treelines are also DENSER and deeper (the `treeCount` multiplier + lateral spread bumped) so the rough
  reads as real forest, not a thin line — still non-penalty, still OUTSIDE the corridor (the death-spiral
  bars held). Animated wind is canvas feel → verified eyes-on; the static streaks are gallery-checked.
- **The swinging golfer + space ambience (play-view "alive" layer).** Each full shot in `playView`
  now opens with a little loader-style golfer (`drawGolfer` — same stick-figure/cap silhouette as the
  intro crew) who addresses → backswings → strikes during a `swingLeadMs` WINDUP, then holds a fading
  follow-through over the first `followMs` of flight. CRITICAL timing change: the flight clock starts at
  CONTACT (`flightElapsed = now - segStart - lead`), so the existing flight/roll/rest/advance logic is
  unchanged — it just runs `lead` ms later. The figure is authored in a ~72-unit local frame and placed
  so its LOCAL ball (club sole at address) lands on the REAL ball, so club/figure/ball stay in proportion
  at any zoom; its px height is `proj.scale`-nudged but CLAMPED [30,56] so it always reads next to the
  fixed-size ball (r3) + flag (14) markers (literal realism makes a 2-yard golfer microscopic in a
  100-yard view — this is arcade proportion, deliberately). All golfer/space knobs live on the EXISTING
  `_gsFeel` object (`golfer`, `golferPx`, `swingLeadMs`, `followMs`, `spaceFX`) — no NEW `_gs*` flag, so
  the test-hub guard needs no new control. The spacey BACKDROP (distant stars over the rough, a far
  ringed planet, a comet) lives in the shared `buildScene` so BOTH renderers + the SVG gallery get it; it
  draws from a SEPARATE rng stream (`hashHole ^ 0x5747a2`) so existing terrain/tree/mote placement stays
  byte-identical, is gated by the existing `art.accents` density, and is culled OFF the cut grass so the
  play corridor stays clean. `playView` adds a thin animated twinkle/shooting-star overlay (`drawSpaceFX`)
  on top for motion only. Canvas feel — verified eyes-on (Playwright frames per swing phase).
- **Focus/zoom + follow-cam (GS-mechanics #7).** The projector has a second fit mode: `focus`
  (centre on a point — the ball) + `viewRadius` (course yards) + `focusBias` (0..1, how far down
  the ball sits) instead of fitting the whole hole. The decision map zooms TIGHT to the contemplated
  shot — `decisionReach = max(30, carryHigh × 0.36)` at `focusBias 0.8` (`DMAP_BIAS`) so the ball
  sits LOW, the shot ahead nearly fills the tall portrait view, the corridor fills the width, and the
  rough/OB legitimately stretch off-screen (the "zoom in, let the hole run off the edges" ask). A
  short approach zooms right in; an unreachable green sits off the top. The reach factor + dims +
  bias live in `app.ts` (`DMAP_W/DMAP_H/DMAP_BIAS/decisionReach`) and MUST be kept in sync across
  the three call sites: the decision `renderHoleSVG`, the `wireMapAiming` projector (tap/drag aim
  unprojects against the SAME params or aiming drifts), and the play-view animation mount. The
  animation uses the same focus + an eased follow-cam (rebuilt per frame) so it tracks the ball and
  matches the decision map's zoom (no jump — also closed the decision↔animation projector mismatch). `Projector.unproject` is the inverse (screen→course) that
  powers tap/drag aiming. The spray cone is drawn as a true ARC SECTOR (curved near/far edges at
  `carryLow`/`carryHigh`, swept ±`z·angleSd`) with min/max carry labels, matching the angular physics.
- **Spray cone = the shot's ASYMMETRIC `SprayShape`, drawn proportional to chance (GS-dispersion-2,
  `holeView.ts` + `shot.ts`).** The cone is the *landing distribution*: a single `SprayShape`
  (`green` + 4 miss zones — `hookL`/`sliceR` orange, `duckHookL`/`shankR` red) drives BOTH the physics
  sampling and the graphic, so they can't disagree. From the centre out per side: a fixed-width GREEN
  wedge (±`greenZ·σ0`, `σ0` = the base angular spread) then ORANGE then RED bands whose widths are
  `sideK·σ0·(zone probability)` — **drawn size ∝ the chance of landing there**, so a 2% red is ¼ the
  width of an 8% orange (the old bug: red drawn WIDER than orange), a 0% zone vanishes, and a one-sided
  suppression reads as a lop-sided cone. Each band is labelled with its true % (`prob·100`). KEY
  invariant: `green = 1 − Σ(miss zones)`, so cutting a miss zone raises green's % while its wedge keeps
  its width ("great shots land where great shots land") — and the freed % flows to GREEN, never to the
  opposite side (a trade-off mod like `−1% duckHook/+1% shank` is the only way to move mass sideways).
  `sprayBands()`/`sprayAngleRms()` are the shared truth (renderer draws them; `resolveShot` samples
  them — categorical zone pick + within-band position, green centre-peaked/triangular, misses uniform,
  SAME 2-rng-draw budget as the old gaussian angle so auto≡interactive holds). The `window._gsSpray`
  escape hatch is now a `SprayGeom` override (`resolveGeom`); `centralPct` scales the green wedge width
  for live A/B. The play-screen legend (`app.ts`) shows the per-zone % straight off `spray.shape`.

## UI layer (locked in GS-8)
- **The screen flow is a PURE reducer** (`ui/game.ts`): `(UiState, Action) → UiState` over the
  run API — intro → play → result → shop → travel → … → gameover. No DOM, no time, so the whole
  interactive flow is unit-tested. `main.ts` renders `UiState` and dispatches actions on clicks.
- **Visual theme is a design-token stylesheet** (the `<style>` block in `index.html`, NOT the SVG
  render layer). CSS custom properties (`--gs-bg/-2/-panel`, `--gs-ink/-dim`, `--gs-line/-2`,
  `--gs-accent/-info/-danger/-gold/-warn`, `--gs-r/-r-lg`, `--gs-shadow`) are the single palette;
  component classes carry the hover/active/focus states inline styles can't express:
  `.gs-btn` (+ `--primary` green CTA / `--ghost` secondary / `--on` selected-toggle / `--block`),
  `.gs-panel`, `.gs-format` (hover-lift title cards), `.gs-chip`, `.gs-clickcard` (hover-lift shop/
  outpost cards), `.gs-scorecard`, `.gs-main` (the cosmic-vignette page frame). The `btn()` helper in
  `app.ts` takes `variant`; a dynamic rarity border is passed as `borderColor` → `--btn-border`/
  `--btn-hover` inline override (used by the travel route lanes). Adding a screen = reuse these
  classes, not fresh inline colours. `cards.ts` keeps its rarity-tinted inline borders/`opacity`
  (the cards tests assert `opacity:1`/`opacity:0.5` + the `rarCol` accent literally) — don't
  refactor those out. The build test forbids `??` and external assets in the bundle; CSS is fine.
- **Save persistence is a side-effect in `main.ts`**, never in the reducer. Resume rebuilds the run
  from the v2 `activeRun` snapshot (`resumeRun`); `?seed=` in the URL forces a fresh run.
- New screens/actions: add an `Action` variant + a guarded `case` (return state unchanged when the
  action doesn't apply to the current screen) and a render branch. Keep logic in the reducer.
- **Play-loop UX (GS-mechanics #1/#2/#3).** The play screen is **full-bleed: the map IS the screen**
  (`.gs-shot` is a viewport-height flex column — a compact **top stat bar** (`playTopBar`: hole #/total,
  par + hole length, live yds-to-pin, the running **zone score vs the cut**, the shot #, plus a thin
  lie/wind/conditions sub-line), then the map as the flex remainder, then club/strategy/Hit at the
  bottom — nothing scrolls, nothing overlaps). The zone-score chip is coloured by how the run tracks
  (`zoneScoreChip`): 🟢 beating the cut · 🟠 within striking distance (gap ≤ ⌈cut/2⌉) · 🔴 well short.
  There is **no per-hole briefing splash anymore** — the old `holeSplash` reducer flag + `startHole`
  action were removed; the zone identity moved to the once-per-stop starting zone screen (see *Zone
  splash card*) and the live per-hole facts moved to the top bar. The **shot-result popup** (a
  settle-delayed modal card + Continue after each non-terminal shot) and its timer are an `app.ts` VIEW
  effect (module vars, cleared by any dispatch), NOT reducer state. The popup card is the RICH `shotCardHTML(shot, {distToPin})`:
  it leads with a procedural **ball-at-rest vignette** (`render/restArt.ts` — a self-contained SVG of the
  ball on the surface it finished on, or the HAZARD alone when the ball wouldn't be visible: water/lava/
  void show no ball, OB shows it beyond the stakes, a holed shot drops into the cup — house rule, no 404
  asset) + club, finish (lie→lie), total/carry/roll, distance left, accuracy. To stop chipping/putting
  cutting to the follow-up too fast, `onDone` HOLDS a beat: a terminal shot waits `resultHoldMs` before
  the hole-complete screen; a non-terminal full shot pops the card; a mid-hole putt waits `puttHoldMs`
  (all `_gsFeel` sub-fields, no new `_gs*` flag). **Free-aim** (`ShotDecision.target`, GS-mechanics #10):
  tap/drag the map sets a course-space target (overrides attack/safe), unprojected from the pointer
  via a reconstructed decision projector and clamped to the longest club's reach; pointer move/up
  listen on `window` so a drag survives the per-frame re-render. **Layout**: a responsive `<style>`
  block in `index.html` drives the full-bleed shot screen (`.gs-shot/.gs-topbar/.gs-bigmap/.gs-bottom/
  .gs-shotscore`); the older side-by-side `.gs-play/.gs-map/.gs-controls` classes still back other
  screens. The map fills the flex remainder and the controls always sit under it without a scroll.

## Loading intro cinematic (`render/introView.ts`)
- A cosmetic, vector-drawn Canvas2D title sequence (no sim, no art asset to 404): four golfers
  pitch their bags into a woody station wagon in a suburban driveway → wheels fold up, it hovers,
  jets extend → it rockets nose-up into a starfield (ignition flash + exhaust plume + warp-streak
  stars + decaying screen-shake), through nebula clouds and shooting stars → a **golf-ball shooting
  star** streaks across the void in the wagon's wake → **the stars it left behind stream down and
  settle into GOLF STARS** (a constellation wordmark with faint linking lines + sparkle glints) →
  hands off to the title. Timings/feel read from `window._gsIntro` (escape-hatch rule: `shake`,
  `nebula`, `planet`, `ballShooter`, `shootingStars`, `starCount`, `constellation`, phase durations,
  `speed`); it's skippable (Skip
  button / click / Esc-Enter-Space), respects `prefers-reduced-motion`, and is gated by
  `sessionStorage` so it plays once per session (`?intro=1` forces, `?intro=0` disables).
- **The sky is continuous with the game (the three asks of this branch).** (1) The space gradient
  resolves to the app background `#0b0d12` (and the overlay base is `#0b0d12`) so the loader→title
  handoff is seamless — no blue-jump when the overlay lifts. (2) The starfield **fills in
  progressively** as the wagon climbs: each star carries a `pop` threshold and reveals once the
  takeoff fill passes it, not one global crossfade. (3) **The title IS stars** — `sampleTitleStars`
  rasterises the wordmark to an offscreen canvas and samples covered pixels into star points; they
  fly in from above (the wake) left→right and settle (`easeOutBack`) onto the letters. If a browser
  denies canvas pixel read-back, `titleStars` is empty and `drawTitle` falls back to a glowing-text
  wordmark — a cosmetic intro must never throw and strand the boot.
- **All effects degrade safely:** the deterministic mulberry32 RNG seeds stars/shooters/dimples (no
  `Math.random`, stable across reloads); every frame runs inside a try/catch that calls `finish()` on
  throw, so a cosmetic glitch never strands the boot. The **golf-ball shooting star** (`drawGolfBallShooter`)
  fires once after launch (`t3`), crossing the upper sky with a dimpled-ball head + tapered glow trail —
  on-theme for *space golf*, no asset to 404. The old **golf-ball planet** (`drawPlanet`) read as a stray
  golf ball overlapping the title, so it's now `planet:false` by default (function kept behind the flag as
  an escape hatch). The wordmark stars all carry a soft glow (heroes glow harder) + a warm underglow band,
  so the title reads legibly bright against the starfield. **PERF GOTCHA:** that glow is a cached
  warm-white `glowSprite` (a radial-gradient offscreen canvas) stamped per star/ball via `drawImage` —
  NOT `ctx.shadowBlur`. shadowBlur is a per-draw Gaussian; applying it to the few hundred title stars
  chugged the framerate to a crawl. drawImage of a cached sprite is ~60fps (verified via a rAF counter).
  Reach for the sprite, never per-element shadowBlur, for any many-instance glow. The launch no longer
  draws a long exhaust-plume/smoke column trailing the climbing car (`drawLaunchFX` is just the pad
  ignition flash now) — that plume read as a weird "jet under the car"; the car's own rear-nozzle flame
  is the exhaust. `holdMs` is 3000 (was 1500) so the formed wordmark lingers ~1.5s longer before handoff.
  CAR GOTCHAS: the rear **tailgate** is hinged at the rear roof corner (`translate(72,-52)`) and rotates
  `0.8 - bootOpen*1.55` — so at `bootOpen 0` it lies FLUSH along the sloped rear (boot reads SHUT) and
  swings up/back as it opens; the old version pivoted at the bottom so `bootOpen 0` stuck a vertical panel
  up and the boot always looked open. The timing (`bootOpen` nonzero only in the load window `t0..t1`)
  already does closed→open→closed; the bug was purely the closed-state geometry. The twin rear **jet
  nozzles/flames** sit at local `ny ∈ [0,16]` (inside the body rect `y -10..28`) — they used to be at
  `[-16,6]`, floating the top one above the roofline. **Title sizing/legibility:** the wordmark samples
  from a `116px` font (was 96) on a denser `step:8` grid with a NARROW hero/normal size+glow gap — a big
  gap + additive `'lighter'` blending blew out hotspots and left the dim letters unreadable; keep heroes
  only a touch brighter so the whole word reads evenly.
- **It is NOT in the pure reducer** — it's a time/DOM side-effect, so it lives in `app.ts` like the
  play-view canvas mount and save persistence. **Gotcha that keeps `tests/build.test.ts` green:**
  `start()` runs the normal `boot()` FIRST (the real title actually paints + sets `data-booted`),
  THEN overlays the intro as a `position:fixed` element on `document.body`. The title is genuinely
  in the DOM from t=0, so the real-browser smoke test (waits for `data-booted`, asserts the title
  text) passes even while the overlay covers the screen. `onDone`/skip removes the overlay,
  revealing the already-rendered, interactive title. A throw inside the rAF loop calls `finish()`
  so a cosmetic glitch can never strand the boot. Canvas feel isn't unit-testable — verified
  eyes-on (Playwright screenshots per phase).

## Art pipeline (Flux)
- Biome / boss-planet / course / item art is Flux-generated (`flux2_max`), text-to-image with
  styled prompts; downloaded into `art/`, lazy-loaded, runtime-cached. Same flow golf-finder used
  for night-sky art (`request_upload_url`→PUT→`generate_image`→`get_history`→download). Keep a
  prompt log so art is regenerable. Rarity tints the card/accent (`RARITY_C`).

## Deploy (GitHub Pages) — the hard-won gotcha
- **Pages Source MUST be "GitHub Actions"** (Settings → Pages → Build and deployment → Source),
  NOT "Deploy from a branch". `pages.yml` builds the Vite app and serves `dist/` — a single,
  fully-inlined `index.html`. If Source is set to a branch instead, Pages serves the repo's RAW
  `index.html`, whose dev entry `<script type="module" src="/src/main.ts">` 404s in the browser
  → permanent blank page. This caused a long blank-page hunt: every code fix was correct but
  **was never the file being served**. Symptom signature: the boot watchdog reports
  `failed to load resource: …/src/main.ts` (a string a Vite *build* can never emit — it only
  exists in the un-built source, so seeing it = raw source is being served).
- The boot watchdog in `index.html` is the safety net: it captures import-time throws AND failed
  resource loads via `window.onerror` + capture-phase `error`, records the first into `__gsErr`,
  and latches so the 5s timeout can't clobber the real cause. Keep it; `tests/build.test.ts`
  guards both the inlined-single-file output and this error-capture contract.

## PWA / installable app (offline without the stale-serve bug)
- **Golf Stars is an installable PWA.** `public/manifest.webmanifest` + `public/icon-{192,512,180}.png`
  (a golf-ball-planet, regenerable via `node scripts/genicons.mjs public` → Playwright renders an SVG to PNG)
  + `<head>` links in `index.html` make it install to a home screen / desktop. The manifest and icons
  are `public/` files copied VERBATIM to `dist/` — they are NOT inlined by `vite-plugin-singlefile`
  (an install manifest can't be a data-URI), and their hrefs are RELATIVE so they resolve under the
  Pages subpath (`/golf-stars/`). They contain no "assets" substring, so `tests/build.test.ts`'s
  no-external-`assets`-link guard stays green.
- **The service worker is NETWORK-FIRST, never cache-first** (`public/sw.js`). Online → always fetch
  fresh and refresh the cache as a side effect; offline → fall back to cache (and the cached app shell
  for navigations). This is the WHOLE point: it buys offline play WITHOUT resurrecting the stale-serve
  blank-page bug — a fresh deploy always wins the moment the device is online. The cache name is
  `golf-stars-<VERSION>`; bump `VERSION` per deploy to retire the prior offline snapshot. Registered
  from `app.ts` (`registerServiceWorker`), guarded to http/https so the `file://` build smoke test
  never tries (and fails) to register, and fully swallowed so a SW fault can't strand the boot.
- **Shared-origin coexistence with golf-finder is PRESERVED.** Both apps live on `foxorama.github.io`;
  a root-scoped sibling SW could hijack/blank this page (the original reason `index.html` nuked ALL
  workers/caches on load). That guard is now NARROWED to kill only FOREIGN workers (scope ≠ our
  subpath) and non-`golf-stars-*` caches, so our own offline worker survives while the golf-finder
  defense stays intact. Our worker registers with a RELATIVE url → scope is `/golf-stars/`, so it can
  only ever intercept Golf Stars. Verified end-to-end (Playwright over http on a `/golf-stars/` mount):
  SW controls the page, scope is subpath-confined, and an offline reload still boots + paints the title.
- This is a deliberate, scoped exception to the "no offline-utility service-worker framing" line under
  *Do NOT carry from golf-finder*: that rule rejected golf-finder's cache-FIRST offline-utility SW (the
  stale-serve hazard); a network-first, subpath-scoped SW for an installable game is the opposite trade.

## Change & versioning flow
- `main` is branch-protected. Each change: branch → edit → commit → push → PR → merge → sync.
- **Default to shipping all the way (this project's rule).** When a change is complete and tests are
  green, take it to done without waiting to be asked: open the PR, merge it (once CI passes), then
  clean up — delete the merged feature branch (local + remote) and sync `main`. Only stop short of
  merging if the work is explicitly WIP, the user says not to, or CI is red/unresolved.
- **Prefer auto-merge over a blocking wait.** Once a PR is open and CI is running, enable auto-merge
  (`enable_pr_auto_merge`) instead of polling for green then merging by hand — GitHub merges it the
  moment the required `test` check (from `tests.yml`) passes, and the head branch deletes itself. The
  bot only needs to land the PR; it doesn't babysit the run. (If CI is already green and there's no
  pending required check, auto-merge "fails gracefully" — just call `merge_pull_request` directly.)
  `tests.yml` has `concurrency: cancel-in-progress` so a newer push supersedes an older run and a
  stale pass can't merge over fresh red.
- **Repo settings auto-merge depends on are admin-UI only (no API tool in this env):** Settings →
  General → Pull Requests → *Allow auto-merge* and *Automatically delete head branches*, plus a
  branch-protection rule on `main` that **requires the `test` status check** (without a required
  check, enabling auto-merge merges immediately — no CI gate). Set these once by hand; they're not
  in the repo. The `tests.yml` workflow is the check the rule should require.
- Use the GitHub MCP tools in the web environment; finish changes by shipping (PR → merge → cleanup).
- Commit messages explain the *why*; end with the Co-Authored-By: Claude trailer.

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
a NETWORK-first, subpath-scoped SW for the installable PWA — see *PWA / installable app* above. That
is the inverse of golf-finder's cache-first offline-utility SW, not a re-coupling of the two apps.)
