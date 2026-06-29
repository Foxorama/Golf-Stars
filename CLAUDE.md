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
  EXCEPTION — **dogleg blocking GROVES (GS-variety) deliberately sit ON the straight tee→green line**
  (but still OUTSIDE the corridor): tall tree stands planted where the cut-the-corner chord leaves the
  fairway, so you can't bomb it straight at the pin and must play AROUND along the fairway (the lever for
  future fairway-follow trick-shot perks). Still non-penalty → `validateFairness` ignores them and the
  fairway route stays clean; scaled by `treeDensity`, capped per hole, and **wildness-gated (≥0.3)** so
  the calm opener stays forgiving. They DO add knockdowns for the straight-line auto reach-AI — they
  tipped ember over the 1.0 bar at full density, so the density/canopy/gate were tuned down (ember 0.23,
  frost 0.49, verdant 0.74 toPar/hole at wildness 1). Re-run `tests/layout-variety` + the no-death-spiral
  bars after touching them. (Crossing gates also dropped 0.3→0.26 — above the stop-0 wildness ceiling, so
  water splits fairways from the mid stops on while stop 0 stays crossing-free.)
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
  - **The apron BLENDS into the corridor — it must not read as a rectangular shelf the green sits on
    (GS-apron-blend).** The old apron was a constant-width strip with a FLAT tee-side cut; on a tight/wild
    hole it was far wider than the narrow corridor, so behind the green you saw a hard-edged rectangle
    with a flat bottom step ("the section around the green that doesn't fit"). Fix: the apron now STARTS at
    the corridor's OWN half-width at the green (`corrHW = mean of leftHW/rightHW at the last point` → a
    flush join, nothing protrudes), swells only enough to WRAP the green (`wrap = max(greenR+9, corrHW)`),
    then tapers to a soft point past it — built from 5 centreline points with `ribbon(..., true, true)` so
    BOTH ends are rounded (no flat cut anywhere). Pure geometry, NO rng → the generation stream is
    byte-for-byte unchanged; only the apron polygon shape (and thus the near-green lie read) shifts.
- **Fairways are RIBBONS with rounded ends, not a pointed almond (GS-terrain, `ribbon`).** The old
  corridor connected its two offset edges with a flat slash AND pinched both ends narrow (a symmetric
  sine undulation floored at 0.55), so a hole read as a leaf/eye floating on the ground — "badly fit in
  at the tee and green". `ribbon(line, leftHW[], rightHW[], roundStart, roundEnd)` replaces
  `corridorPoly`: it offsets each side by its OWN half-width (so the fairway bulges asymmetrically, not a
  mirror) and caps each end with a smooth rounded NOSE (a turfed front edge at the tee, a soft finish at
  the green) instead of a flat cut or a point. The per-point width PROFILE is now believable: an END
  ENVELOPE keeps the body FULL and only EASES (never pinches) toward the ends, 1–2 Gaussian LANDING-ZONE
  bulges swell where you land (25–55 yd in real design — fairway wide off the tee, narrowing to the
  green), plus a gentle wave + one localized pinch, with a slow LATERAL asymmetry splitting left/right.
  Mean ≈ baseHalf so the `widthScale = 2.0 − 1.25·wildness` early→late lever and the death-spiral bar
  are preserved. CRITICAL: `fairwayHalfWidth` (hazard placement) and `fairwayHalfWidthOf`
  (`validateFairness`) still key off the corridor's WIDEST point (`max(leftHW, rightHW)` / the FIRST
  fairway feature), so penalty hazards stay provably clear; the apron now uses `ribbon` too (rounded
  back nose, no taper to a point). Re-shoot the gallery after any profile change.
- **More + bigger water and fairway breaks (GS-terrain), all pure biome DATA, wildness-gated:**
  • `waterCreek` — a `creek` band crosses the fairway as a FORCED CARRY (parkland/`verdant`), a new
    sanctioned crossing (`CROSSING_KINDS += 'creek'`, `LIE_INFO.creek` penalty:'water', styled as water):
    `validateFairness` exempts it, `validateCrossings` proves it carryable, and the carry-aware AI flies
    it GENERICALLY (it keys off `penalty`, never the kind). ONE crossing per hole — a creek is skipped if
    a river/pond already crosses, so a safe shelf always exists between. • `ponds` — large flanking
    lakes/"dams" of penalty water (r 16–40), placed CLEAR of the corridor (so an offline miss is costly
    but no unfair carry). • `fairwayBreaks` — a sandy `waste` band cutting clean across the fairway
    (precedence 3 → reads as 'waste', NON-penalty, so it may sit on the line and `validateFairness`
    ignores it) — a visible "break" you carry or thread, never a lost card. `crossingBand` took
    `spillMin/Max` so a break spans mostly the fairway, not deep rough. • Trees are DENSER and DEEPER
    (`treeDensity` bumped; lateral spread `+rng(5,72)` keeps a clear gap off the corridor edge — only an
    offline shot finds the woods, the GS-13 invariant — then fills deep so the rough reads as real
    forest). Balance: the wilder terrain lifts max-wildness `toPar/hole` 0.136 → ~0.24 (≪ 1.0, 0%
    blow-ups, 0 validation failures). NOTE: the wilder landscape AMPLIFIES the auto reach-AI's
    coverage-blindness (a precise "just reaches" club drops into trouble the sparser bag's over-club flies
    past), so `tests/club-rewards.test`'s Pro-coverage "no-regression" slack was widened 0.2 → 0.5 — an
    auto-AI artifact, not unfairness (the death-spiral bar holds; the interactive dial-in win is unchanged).
- **Crossings are MEANDERING RIVERS that pool into connected lakes, not perpendicular bridge-bands
  (GS-river-shape, `riverChannel`).** The old `crossingBand` laid a straight band perpendicular to play —
  it read as a flat "bridge" slab, and a separate flanking `pond` floated nearby unconnected. Grounded in
  how real courses route water (the classic strategic hazard is a stream cutting ACROSS on a DIAGONAL — a
  heroic carry you "bite off as much as you dare" — and natural water meanders down a hollow and POOLS into
  a lake where it runs out), `riverChannel(centreline, t, fairwayHalfWidth, thickness, rng)` now builds the
  lava river / frozen pond / creek: it crosses on a random DIAGONAL axis (the lateral rotated ±~31°, so no
  two rivers run the same way), MEANDERS (two seeded sines whose amplitude is held at ZERO across the
  corridor — clean carry — then grows out in the rough), runs WELL off into the rough on each side
  (asymmetric reach, the longer arm pooling into a LAKE the generator drops at the returned `mouth`: a
  separate `water`/`lava` blob, same liquid FAMILY, so the render merges river+lake into one seamless body
  — the "rivers don't merge into lakes" fix), and has a believable variable width. CRITICAL — single
  crossing, whatever the hole shape: a long diagonal arm can re-meet a doglegging centreline far away and
  create a SECOND, unprovable bank, so each arm is built OUTWARD step-by-step and TRUNCATED the instant a
  point PAST the corridor zone re-approaches the centreline (`polylineDist < 1.1·halfWidth`). The crossing
  still passes exactly through the corridor point `c` (meander anchored to 0 there), so `validateCrossings`
  proves every one carryable and `validateFairness` exempts it; the pooled lake is guarded by
  `clearsPlayCorridor` (so it stays a fair, avoidable side-hazard). `crossingBand` is KEPT for the sandy
  `fairwayBreaks` waste band (a clean cross-cut is right there). Re-shoot the gallery and re-run
  `tests/zones.test.ts` after any `riverChannel` change (the diagonal/reach knobs can trip the carryable bars).
- **Greens span the full vocabulary now (GS-terrain extends GS-greens).** `greenPoly` got FOUR seeded
  harmonics (bigger amplitudes), a low-frequency PEAR/teardrop bias (one end fatter), and 0–2 KIDNEY
  bites — so greens read unmistakably as round/oval/long-shelf/pear/kidney/boomerang/clover, not a gently
  wobbled circle. Still STAR-SHAPED about `green` (single-valued r(θ), floor 0.32·baseR) even when
  concave — the anisotropic stretch is linear so it preserves star-shapedness, and `pinInGreen`/
  `rayPolyDist`/`validateCourse` (pin-in-green) all still hold.
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
- **Every world has a SIGNATURE mechanic now (GS-19 + GS-mechanics), pure DATA opt-ins on the biome
  row, wildness-gated so a calm stop plays fair and a deep one bites:** void `lostRough`, inferno
  `lavaRiver`, **frost `frozenPond`** (a meltwater crossing), **desert `craters`** (a crater field),
  verdant tree-lined parkland (its density IS its character). The two CROSSING mechanics (lava river,
  frozen pond) share one machinery: `CROSSING_KINDS = {lavariver, frozenpond}` are penalty bands that
  may sit ON the corridor — `validateFairness` EXEMPTS them and `validateCrossings` PROVES each one
  carryable (centreline enters+exits, with a penalty-free shelf BEFORE the near bank to lay up and
  just AFTER the far bank to land the carry); both are built by the shared `crossingBand`, and the
  carry-aware AI flies ANY centreline-crossing penalty (it's generic, never hardcoded to lava). The
  details:
  - **Frost = frozen ponds (`ice-ring.frozenPond: true`).** A `frozenpond` band (penalty water, drawn
    via `styleWater`, `restArt` shows the water scene) crosses a par-4/5 past `FROZEN_POND_MIN_WILDNESS`
    (0.3) — a touch narrower than the lava river. Guarded by `tests/zones.test.ts` (carryable + under
    the no-death-spiral bar).
  - **Desert = impact craters (`dust-belt.craters: 2.2`).** Big (r 12–22) round sand bunkers pock the
    landing zones — a navigable crater field. Sand is NON-PENALTY so they may sit ON the corridor (a
    50% escape tax, never a lost card); `validateFairness` ignores them. A real obstacle that bites
    scoring without unfairness.
  The original two:
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
- **Push-your-luck banking (GS-bank).** `bank(run)` (reachable from the travel screen, stop 1+) ends a
  run as `endedReason 'banked'` and `cashOutShards` converts its UNSPENT credits → shards
  (`CREDITS_PER_SHARD` 20); a missed cut forfeits them (the cut path is byte-for-byte unchanged). So
  every travel screen is a real "spend for power to push, or hold to bank" decision and credits have a
  terminal value. `shardsForRun = base(distance×3+stops×2) + cashOut + (won ? WIN_SHARD_BONUS : 0)`.
- **The Voyage = a bounded, WINNABLE campaign (GS-voyage, the headline format).** `formats.ts` gained
  `BossSpec` + `StopSpec.boss/splitBiome` + `RunFormat.winnable/cutMult/maxJump`. `voyage` is three
  arcs, each two ordinary stops then a BOSS (`bossAt`), the last `final` → clearing it sets
  `endedReason 'won'` in `finishStop` (status ends, not 'active'). `effectiveCut` adds the boss
  `cutBonus` AND scales the distance ramp by `cutMult` (a fixed-length run must PLATEAU, not spiral —
  the endless flat/ladder formats keep cutMult 1, byte-identical) AND adds the Ascension bonus.
  `routeOptions` caps the jump at `maxJump` and derives `elite` (the harder/richer lane — highest
  `cutDelta`, no extra rng) + `bossAhead` previews. CRITICAL: flat/ladder are untouched (no boss, no
  winnable, default cutMult/maxJump → existing tests + rng streams byte-identical). Auto reach-AI win
  rate ~7.5% no-meta → ~40% maxed (interactive is higher); tune via cutMult/maxJump/cutBonus.
- **Ascension difficulty ladder (GS-ascension).** `run.ascension` (0..`ASCENSION_MAX` 8, voyage-only in
  practice) adds `ascensionCutBonus` (flat per stop) to `effectiveCut` and thins the starting purse
  (floored at 20). Winning at your current top tier unlocks the next (`unlockedAscension` in the
  reducer); the unlocked tier persists in **save v4** (`maxAscension`, v3→v4 migration). Selectable on
  the title's voyage card (clamped to unlocked). Round-trips through snapshot/resume (absent → 0).
- **Co-op SCRAMBLE bosses (GS-scramble).** A `boss.partner: 'scramble'` stop pairs you with an unchosen
  golfer (`scramblePartnerId`, deterministic). `scrambleOptsFor(run)` carries the partner's swing shape;
  `playHole` (auto) and `takeShot` (interactive) each fire a SECOND `executeShot` (partner's shape, same
  club/target) and keep the better via `pickBetterExec` (holed > fewer penalties > closer to flag) for
  ONE team stroke. CRITICAL: the partner draw fires ONLY when scramble is armed, so a normal hole's rng
  stream is byte-for-byte unchanged and auto≡interactive holds (the player draw is first in both). It's
  a real co-op assist (a boss course's mean SF lifts ~17.9→21.7), the fair-difficulty lever for bosses.
- **Multi-biome SPLIT stops (GS-variation).** A `StopSpec.splitBiome` stop CROSSES TWO WORLDS:
  `currentCourse` → `stitchSplitCourse` generates the front holes from the stop's theme and the back
  holes from a DISTINCT theme of the same arc, concatenated; every Hole is stamped with its own
  `biome`/`themeId` (new optional Hole fields, render-only — physics ride `biomeMods`) so it both
  renders (per-hole `holeBiome`/`holeThemeId` in app.ts) and plays as its world. Each half goes through
  the normal generator, so `validateFairness`/`validateCrossings` PROVE both fair (a split course only
  builds if both halves pass). `CourseMeta.split` records it. Stops also vary in SIZE (voyage 6/7/9).
- **Trigger relics + curse + reroll (GS-synergy).** Economy relics (`loadout.birdieCredit/eagleCredit/
  comebackCredit`, via `relicCreditBonus(loadout, played, passed)`) pay credits at the end of a PASSED
  stop for a PLAYSTYLE (aggression / comeback) and fold into `creditsForStop`'s `bonusFlat` BEFORE the
  multiplier, so they COMPOUND with credit perks (the snowball archetype). A base loadout pays 0
  (byte-for-byte economy); a failed stop pays 0. The **Glass Cannon** curse is an opt-in gamble (wider
  hook/slice via shapeMod for +60% creditMult). The shop **reroll** (`rerollShop` action, `rerollCost`
  30×1.6^n) redraws `shopOffer(run, size, salt)` — salt 0 keeps the original draw byte-identical.
- **Fail gate = the cut line** (`economy.ts`): each stop needs a minimum Stableford that ramps
  with galaxy distance. Beat it to travel on; miss it and the run ends. Reuses the score we already
  compute — and guarantees runs terminate. Credits (from Stableford) buy one-shot shop perks.
- **The cut is calibrated to where golfers SCORE, not below it (GS-cut-curve).** Both the player and
  the ghost field average ~2 Stableford/hole (par pace), but `cutLine` used to start at ~1 pt/hole — half
  the field's scoring — so arc 1 was a free pass and the leaderboard never thinned (measured: field stop
  scores 10–19 over 6 holes vs a cut of 6, **0% of the field cut** the whole voyage). Now `cutLine =
  round(holes·(1.7 + dist·0.09))` STARTS near par pace (~1.7 pt/hole, so even stop 0 cuts the weak tail)
  and ramps ABOVE it (toward ~2.6 pt/hole deep) — a real "decent curve" that eliminates characters at the
  end of each stage. The unupgraded auto reach-AI (the difficulty FLOOR) still clears arc 1 (~99/93/69%
  per stop) and the gate tightens through arcs 2–3; an upgrading/interactive player keeps pace, and the
  voyage's `cutMult` (0.65) still softens the distance term so a bounded campaign plateaus. Re-run the
  `tests/` cut harness after touching the base/slope or `cutMult`. (No test hard-requires the auto-AI to
  WIN the voyage — `voyage.test` only asserts the run terminates — so the cut can bite hard at the final.)
- **Route events make travel a decision (GS-14, rebalanced GS-routes, `events.ts`).** A jump used to
  differ only by distance; now each route carries a themed, content-as-data **event** that tilts the
  stop you fly *into*. The original two levers (`creditMult` payout, `cutDelta` fail-gate) made every
  lane the same shape, with no real downside, so a green common often beat a rare (the imbalance the
  rebalance fixes). Now FOUR pure levers give lanes DISTINCT, traded-off shapes: + `creditToll`
  (credits paid UP FRONT in `travel`, floored at 0 — a genuine cost so the rich lanes bite) and
  `shardBonus` (permanent shards banked in `travel` onto `run.bonusShards`, kept even on a later bust
  — the meta/"banker" lane, added by `shardsForRun`). Calm lanes are now SAFE-BUT-POOR (creditMult ≤
  ~1.05, or they charge a toll) so a common is never a strictly-better rare; rarity = STAKES (the
  reward CEILING rises monotonically common→legendary, and so does the risk). The chosen event rides
  `run.pendingEvent` (set by `travel`), applied by `finishStop` via `effectiveCut()` + the credit
  mult, then **cleared** there so a resume can't double-apply it (`RunSnapshot.pendingEventId` +
  `bonusShards` round-trip it). Stop 0 / no-event = the neutral `DEFAULT_EVENT`, so existing stop-0
  behaviour is byte-for-byte unchanged. CRITICAL: events touch ONLY economy/cut/meta, NEVER course
  generation — that's what keeps the fairness + no-death-spiral validators untouched. Keep it that
  way; a "wilder course" event would have to re-clear those bars.
- **The route draw is a per-ARC rarity SLOT model (GS-routes, `drawArcRouteEvents`).** Not a flat
  rarity-weighted shuffle — the loot feel ramps with the journey via `ARC_SLOTS[arcForDistance(dist)]`.
  Each slot names a BASE rarity + a GATED upgrade `chain` (`chain[k]` = P(climb one more tier | climbed
  the last)): arc 1 = two commons + a wildcard (≈82% common / 14% rare / 4% epic); arc 2 = a common, a
  CROSSOVER (≈50/50 common↔rare, may reach epic/legendary), and a rare (→epic →legendary); arc 3 = two
  rares + an epic, all upgradeable — **up to THREE legendaries**. `routeOptions` draws the 3 distances
  FIRST (so flat/ladder rng streams stay byte-identical) then the events from the dedicated
  `:routes:stop` stream. Safety net is ARC-GATED: arcs 1–2 GUARANTEE a lower-risk OUT (swap the
  lowest-stakes slot for a calm event if the draw produced none); arc 3 does NOT (the deep voyage / the
  endless & ascension steady state is deliberately all-or-nothing — commit or bank). `pickOfRarity`
  degrades a missing tier toward common first. The travel screen renders a deterministic SVG **starmap**
  (`render/starmap.ts`): Earth → the travelled trail → YOU (the station-wagon spaceship) → three branch
  planets colour-keyed to the choice cards (rarity ring + event glyph + ⚔ boss / 🔥 harder-path marker),
  pure + seeded (no Math.random, no 404 asset). Each `RouteEvent` carries an `icon`, `lore`, and a
  functional `category` (calm/payout/toll/salvage) so the cards read as distinct bets. No new `_gs*`/URL
  hook (the new events appear in the Sim Lab automatically) → the test-hub guard needs no new control.
  - **Distinct lanes + a touch richer (GS-routes tuning).** Choices felt interchangeable (often three
    near-identical commons). `drawArcRouteEvents` now `diversifyCategories` — same-rarity swaps so the
    three lanes span DISTINCT reward categories (a safe out, a payout gamble, a salvage/toll play), making
    each jump a real decision; same-rarity only ⇒ the per-arc mix + triple-legendary ceiling are
    untouched. The `ARC_SLOTS` upgrade chains were nudged up (arc 1 stays >70% common / no legendary), and
    the shop's `rarityDepthBias` tilt eased early (0.5→0.58) and raised deep (1.9→2.15) so epic/legendary
    rewards surface a touch more. Guarded by the existing `tests/events` + `tests/pro-shop` invariants.
  - **The starmap trail is the REAL visited path (GS-journey).** The travelled trail used to be
    anonymous interpolated dots keyed off `stopIndex`, so it read as "Earth → YOU" no matter how far
    you'd come. Now `app.ts` passes `StarmapOpts.trail` = `run.history.slice(0,-1)` mapped to zone
    names (the current stop IS YOU, so it's dropped), and the starmap draws each cleared world as a
    NAMED node along the curve (Earth → stage 1 → stage 2 → … → YOU), most-recent-`MAX_NODES` shown
    with a `＋N more` summary near Earth. Pure/seeded as before; `trail` is optional (falls back to the
    old anonymous dots) so the helper stays drop-in.
  - **The journey map is a SCROLLABLE, galaxy-exact star-chart (GS-galaxy-map, `render/starmap.ts`).**
    The old `starmapSVG` crammed Earth + every cleared node + YOU + the 3 forward branches into ONE
    fixed 360×212 frame, so it SQUISHED as the run grew (MAX_NODES=4 + a `＋N more` summary only papered
    over it). Replaced by `journeyMapHTML(opts)` → an HTML widget of TWO flex siblings: a wide,
    horizontally-SCROLLABLE trail strip (`.gs-journey-trail`, `overflow-x:auto`) holding ALL cleared
    worlds, and a NON-scrolling forward panel (`.gs-journey-fwd`) pinned to the right that always shows
    YOU (the wagon) + the three branch lanes. `app.ts`'s render() snaps the strip's `scrollLeft` to the
    far right on a NEW stop (so the most-recent ~2 worlds sit next to YOU), then honours wherever the
    player tap-scrolls back (persisted in the module-level `journeyScroll = {key, left}` so it survives
    the per-frame re-render; the key is `seed:stopIndex`). The forward panel is OUTSIDE the scroll area,
    so "the paths forward are right-stickied as you scroll" falls out of the flex layout — no CSS sticky
    needed. GALAXY-EXACT: every theme is grounded in a real constellation/deep-sky object, so it has a
    true J2000 position — `scripts/gen-sky-coords.mjs` extracts `THEME_SKY` (theme name-slug → {ra,dec};
    constellations = figure centroid, deep-sky = own coords, the 2 galaxy features = hand-pinned anchors)
    into the GENERATED `src/render/sky-coords.ts` (DO NOT EDIT BY HAND — re-run the script). `app.ts`
    maps each trail stop through `skyCoordForName(theme.name)`; the strip plots node Y by real
    DECLINATION (a FIXED celestial window `dec +38..−80 → top..bottom`, so a world's height is stable
    across the whole run and re-renders never shuffle earlier nodes) and the X-gap to the previous world
    by real ANGULAR distance (`clamp(50 + greatCircleDeg·0.72, 64, 168)`) — so a hop to a far-flung
    constellation visibly LEAPS further. Pure/seeded (no `Math.random`); the forward branches are NOT
    positioned by sky coords (a fan is clearer than 3 tiny coord dots) but DO now read the destination
    BIOME each lane flies into (GS-journey-biome below). NO new `_gs*`/URL hook (the scroll snap is a plain post-render DOM nudge, sky-coords
    is a render table) → the test-hub guard needs nothing. Guarded by `tests/journey-map.test.ts` (every
    theme resolves to a valid coord, one node per stop / no truncation, far-hop > near-hop spacing,
    determinism). Re-run `gen-sky-coords.mjs` + that test after adding a theme.
  - **Consecutive jumps never repeat the same lanes (GS-journey anti-repeat).** The early-arc common
    pool is small (slots = 2 commons + a wildcard), so an unconstrained draw kept showing the same 3
    lanes stop after stop. `routeOptions` now recomputes the PREVIOUS stop's offer (`offerEventIds`,
    pure, from `run.history[-2]`'s stopIndex/distance — no new run/save state) and FILTERS those ids
    out of this stop's event pool before `drawArcRouteEvents`. Stays a deterministic pure function of
    `run` (so `routeOptions(run)===routeOptions(run)`); empty at stop 0. The arc-1 common pool was
    also widened (more commons/rares/an epic) so each tier has genuine variety. Guarded in
    `tests/events.test.ts` (no two back-to-back offers are the same id-set; determinism preserved).
  - **The trail CONNECTS to the wagon with no seam (GS-journey-connect, `starmap.ts`/`index.html`).**
    The old widget had two failings: a hard dark vertical SEAM where the scroll strip met the pinned
    forward panel (a `box-shadow: -14px 0 …` band), and the trail line floated short of YOU (the trail
    SVG's `trailW` had an `FW+120` floor wider than a phone strip, so the bridge end never reached the
    seam). Fix: (1) the starfield+nebula moved OUT of the per-panel SVGs into ONE continuous CSS
    background on `.gs-journey` (shared by both flex siblings), so the sky is seamless and there's never
    a starless gap — the SVGs are now transparent; the box-shadow is gone. (2) The trail SVG is
    `min-width:100%` + `preserveAspectRatio="xMaxYMid meet"`, RIGHT-ANCHORING its content to the seam
    when the trail is shorter than the strip (so the dashed bridge into YOU always meets the forward
    panel's solid lead-in stub at `MID_Y`, Earth still visible), and just SCROLLING when it's longer
    (app.ts still snaps `scrollLeft` to the right). (3) `trailW` floor dropped `FW+120 → 140` so a short
    trail right-anchors instead of force-scrolling Earth off-screen. Verified eyes-on (Playwright render
    of the empty + long-trail cases); `tests/journey-map.test.ts` still green (node/coord asserts read
    viewBox coords, unaffected by the anchor).
- **The route you pick DETERMINES the next biome (GS-journey-biome, `run.ts`).** A jump used to set
  only distance + a credit/cut event, while the stop's WORLD was a separate deterministic draw
  (`themeForStop`) — so you chose a lane and arrived in an unrelated biome. Now each `Route` carries a
  `theme` (its destination world), drawn by `routeTheme(seed, stopIndex, routeId, reachedDistance)`
  from the ARC of the distance THAT jump reaches (a deeper jump → later-arc, wilder world) on its OWN
  `:routetheme:` rng stream — so attaching it leaves the `:routes:` draw order (distances + events)
  byte-for-byte unchanged. `travel` records it as `run.pendingTheme`; `currentTheme` honours
  `pendingTheme ?? themeForStop(...)` (the fallback keeps STOP 0 / old resumes byte-for-byte). Snapshot
  round-trips `pendingThemeId`. The route card + the map planet now read the destination biome (colour
  + glyph + name via `BIOME_BADGE`/`BIOME_LOOK`), so a lane previews the world you'll actually play.
  Content-as-data + pure, so no fairness/no-death-spiral validator is touched (it only SELECTS the
  biome, like `themeForStop` always did). Guarded by the existing themes/formats/voyage suites (which
  read `currentCourse`/`currentTheme` consistently) + full determinism.
- **The route you pick MATERIALLY shapes the next course — difficulty + atmosphere (GS-journey-fx,
  `effects.ts`).** A lane used to differ only by economy/cut levers, and the cut lever does NOTHING on a
  matchplay-boss stop (positional survival, not a Stableford cut) — so the choice felt inconsequential.
  Two PURE levers, BOTH derived from the chosen route's event (so NO new run/save state — `pendingEvent`
  already round-trips, and `currentCourse` re-derives both): (1) **difficulty** — `routeDifficulty(ev)` =
  `clamp(−0.15, 0.25, round(cutDelta)·0.07)` is a wildness DELTA threaded into `generateCourse`
  (`wildnessBoost`, added before the `[0.05, 1]` clamp) so a harder lane generates a genuinely WILDER
  course (tighter corridors, more hazards, sooner-armed signature mechanics) and a calm lane a gentler
  one — and this BITES on a boss course where the cut lever is inert. CRITICAL: clamped to ≤1, i.e. never
  beyond the wildness=1 case the no-death-spiral / fairness validators already prove; `wildnessBoost 0` is
  byte-for-byte the old generation (the lower clamp never bites the unboosted base ≥ 0.1). (2)
  **atmosphere** — `routeEffect(ev)` maps the event (icon/id → category) to a render-only `CourseEffect`
  (`moonlight`/`meteorShower`/`solarStorm`/`aurora`/`spaceJunk`/`tradeMarket`), stamped on `course.meta.effect`
  and drawn by BOTH renderers (`courseEffectPrims` in `style.ts` for the static scene — sky tint/moon/
  meteors + course-space debris/trade-camp decor off the `crng` celestial stream, so it perturbs no
  terrain placement; `drawCourseFx` in `playView.ts` for the animated falling-meteor/aurora/storm
  overlay). Touches NEITHER physics NOR generation rng, so fairness is untouched and a `'none'`/absent
  effect adds nothing. The starmap history nodes now wear each cleared world's **biome glyph** with a
  gentle twinkle (`StarmapStop.glyph`), the forward planets carry an **effect badge** (`effectIcon`), and
  the route card previews the destination biome + a **difficulty band** + the effect blurb — so the
  choice's impact reads at a glance. No new `_gs*`/URL hook (effects ride course meta; difficulty rides
  the existing event), so the test-hub guard needs nothing. Tests: `tests/journey-effects.test.ts`
  (difficulty clamp/monotonicity, effect mapping, that a harder lane raises `currentCourse` wildness +
  stamps the effect, stop-0/no-event unflavoured). Re-shoot the gallery only if `style.ts` base changes
  (effect prims are gated behind `opts.effect`, so the no-effect gallery is byte-identical).
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
- **Balanced 11-club starting bag + rare+ club rewards (GS-clubs-2, supersedes GS-clubs' sparse bags;
  `characters.ts` + `economy.ts`).** EVERYONE starts with the SAME balanced 11-club bag (`BALANCED_BAG`:
  D, 5W, 3H, 6i, 8i, PW, GW, SW, LW, 60°, putter) — driver+putter bookends with a dense short-game
  ladder (PW→60° are 10–20 yd apart) and the gaps loosening only up high where a long approach forgives
  a few yards. This REPLACED the old sparse signature bags (`STARTING_BAGS`), which left big scoring-zone
  gaps so dialling distance DOWN near the green over-clubbed — the "small club list is too hard close in"
  complaint. Character identity now lives in the SHOT SHAPE (`clubMods`) + the distance scalars (Larry
  +14 / Bo −8), NOT a hand-cut bag; the only per-golfer bag difference is **Larry's `BALANCED_BAG_NO_HYBRID`**
  (3-Iron swapped in for the 3-Hybrid, since `noHybrids`). The balanced bag scores BETTER than the old
  sparse ones (more coverage → the reach-AI over-clubs less), so the no-death-spiral guard (relaxed toPar
  < 1.15 + blow-up < 5%, baselined on the ROSTER mean) got SAFER, not riskier — re-run `tests/characters.test.ts`
  after any bag edit. **Clubs are LOOT.** A reward club is a `ShopItem` (`CLUB_ITEMS`, GENERATED from
  `CLUB_SETS` × `REWARD_CLUB_TYPES`) whose `apply()` `equipClub`s it into the bag — replacing the club of
  that TYPE, or adding it (bag holds ONE per type, sorted longest→shortest). Each bag `Club` carries
  optional `set`/`rarity`. **The shop sells ONLY rare+ IMPROVEMENTS now — no common gap-fillers.** Three
  reward sets: `tour` (rare, `distanceOnly`, +8 carry), `masters` (epic, `distanceOnly`, +16) — the
  DISTANCE upgrade ladder; and `pro` (rare, `scoringOnly`, +0 carry) — SCORING coverage at base distance
  (a club for a distance the balanced bag skips, so you can dial the shot in: the interactive fix for the
  complaint). The legacy common `starter` set is kept in `CLUB_SETS` (`offerable: false`) ONLY so old
  saves that bought a `club:starter:*` perk still resolve it — it is never offered. Carry bonuses apply to
  DISTANCE clubs only (a +carry scoring club OVERSHOOTS the green — the power-cell lesson; `buildRewardClub`
  suppresses it and `pro` carries base). Ownership rules (`offerableClubs`): a type you LACK → offered (NEW
  coverage); a type you CARRY → offered only as a genuine carry UPGRADE (a higher-rarity DISTANCE club) —
  a scoring club you hold is never "upgraded" (same carry = no gain). **Larry never sees hybrids**
  (`loadout.noHybrids` filters `isHybridType`). **Driver Dan gates on OWNING a driver** (`shopOffer` drops
  `driver-dan` unless the bag has a `DRIVER_ID` club) — everyone now starts with one, so he's eligible
  from the off (still epic-scarce). **ONE merged 4-card offer (no separate Reward-Clubs row):** `shopOffer`
  draws its `SHOP_OFFER_SIZE` from the COMBINED pool of perk gear ∪ `offerableClubs(loadout)`, one
  rarity-weighted stream (`${seed}:shop:${stop}`); the old separate `clubOffer`/`CLUB_OFFER_SIZE` are
  GONE. **`clubOfferNote(item, loadout)`** is the pure helper the shop card's badge reads: `{kind:'upgrade',
  gainYd}` for a club you carry, or `{kind:'new', carry, longerName, shorterName}` (the bag clubs that
  bracket the gap it fills) for a new club — `app.ts` renders it as a "▲ UPGRADE · +N yd" / "✚ NEW · ~N yd
  (X→Y)" pill so the buy decision reads at a glance. **Save-stable:** the bag is NOT serialised —
  `loadoutFromPerks` rebuilds it from the character's starting bag (via `startingLoadoutFor`) + the bought
  club perk ids, applied in purchase order so the latest tier wins. **`distanceClubBonus`** on the loadout
  is the running flat carry bonus on distance clubs (character ±, Tour Bag +6/level) so a reward distance
  club bought mid-run inherits the same bonus the starting distance clubs carry. CRITICAL ORDERING:
  `startingLoadoutFor(meta, characterId) = applyMeta(meta, applyCharacter(characterId, startingLoadout()))`
  — character FIRST (sets the bag), meta SECOND (Tour Bag boosts THAT bag); `startRun`/`resumeRun`/the Sim
  Lab all use this one helper. `tests/club-rewards.test.ts` guards ownership/hybrid/driver rules,
  equip/replace, `clubOfferNote`, the merged offer, the distance-bonus inheritance, snapshot/resume, and
  that distance upgrades raise — and Pro coverage never lowers — the roster mean Stableford (coverage is an
  INTERACTIVE win the auto reach-AI barely exploits, so its guard is "no regression", not "strictly helps").
  **Deferred:** scoring-club UPGRADES via a real stat (per-club dispersion/effect, not carry) and
  location-specific legendary sets with game effects (the Tarantula Network's Spyder putter — one row each).
- **Persistent meta-progression (GS-12, `meta.ts`):** runs bank **Star Shards** (`shardsForRun` =
  distance×3 + stops×2, floored at 1) in **save v3**, spent at the Outpost on PERMANENT, leveled
  *starting* upgrades (`META_UPGRADES`: Veteran Hands −2 hcp, Tour Bag +6yd, Steady Grip −4% spray,
  Deep Pockets +40 credits) at a geometric shard cost. `startRun(seed, fmt, meta)` bakes them into
  the starting loadout/credits (`metaStartingLoadout`/`metaStartingCredits`); shop perks rebuild OVER
  the meta base (`loadoutFromPerks(perks, base)`), and the run snapshot carries `meta` so resume
  reconstructs both layers. Two currency layers: **credits** = per-run (reset each run, shop perks);
  **shards** = cross-run. Save v3 migrates v2→v3 (drops the dead always-0
  `credits` field) via the one-step-at-a-time `migrate` chain.
- **Star Shards buy COSMETIC SHIPS at the Trade Market now — the permanent STAT spend is retired
  (GS-garage, `ships.ts`/`shipArt.ts`).** The permanent stat-upgrade Outpost is gone: those effects
  (−hcp, +distance, −spray, +credits, putt) already live in the in-run **Pro Shop** as buyable perks
  (Caddie Lesson / Power Cell+Range Booster / Gyro+Precision / Lucky Coin+Fortune Chip / Pro Putting
  Grip), so they're now "baked into the run" instead of permanent. `META_UPGRADES`/`applyMeta` stay in
  `meta.ts` ONLY for old-save grandfathering + as a test loadout-construction utility — nothing in the
  UI offers them anymore (`startRun` still folds any grandfathered levels, so old saves keep what they
  bought). Shards instead buy **ships** (`SHIPS`: a free default `Woody Wagon` + ~8 priced craft across
  sets — the blinged Wagon line chrome→gold→cosmic, Racers, a Hauler, a UFO, a golf-ball Comet — tiered
  by rarity = price). PURELY COSMETIC: the chosen ship is the "YOU" craft on the journey-map starmap
  (`shipSVG` replaced the hard-coded `wagonGlyph`; the default look is byte-identical). The between-run
  screen (still `screen: 'outpost'`) is now the **Trade Market + Garage**: a rotating `marketOffer`
  (a seeded sample of UNOWNED ships, size `MARKET_OFFER_SIZE`) you buy with shards, RESET each completed
  run (a persisted `marketSeed` bumps on every run end) with a steep escalating **reroll**
  (`marketRerollCost`); plus a **Garage** that flies any owned ship (`selectShip`). Reducer actions
  `buyShip`/`selectShip`/`rerollMarket` (replaced `buyUpgrade`); ownership + selection + `marketSeed`
  persist in **save v6** (v5→v6 migration seeds the starter wagon). Pure + deterministic; ships never
  touch the sim, so there are no balance/fairness implications. No new `_gs*`/URL hook. Tests:
  `tests/ships.test.ts` (catalogue/offer/reroll/affordability), `tests/save.test.ts` (v6 migration),
  `tests/ui.test.ts` (buy auto-flies, garage select, market guards + reroll).
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
- **The shop is the PRO SHOP, staffed by a per-world Pro, with a DEPTH-RAMPED rarity mix
  (GS-proshop).** Two coupled changes:
  - **Rarity now RAMPS with galaxy distance.** The catalogue is count-skewed toward rare/epic (≈6
    common / 15 rare / 11 epic / 3 legendary in `SHOP_ITEMS`, plus rare+ reward clubs), so the old
    flat `RARITY_C`-weighted draw front-loaded rare/epic and only dribbled commons in LATE as the
    rare/epic uniques sold out — backwards from how loot should feel. `rarityDepthBias(rarity,
    distanceFromStart)` (run.ts) multiplies each rarity's base drop weight by `b^order`, where `b`
    lerps `RARITY_TILT_EARLY 0.5 → RARITY_TILT_DEEP 1.9` over `RARITY_RAMP_DEPTH 18` (the same depth
    signal the cut ramps off): commons (order 0) stay ×1; rare/epic/legendary start <1 (scarce early)
    and rise >1 deep. So early stops stock cheap foundational COMMONS, deep stops stock rare/epic/
    legendary POWER. CRITICAL: this only changes WHICH items the `weightedSample` picks (folded into
    `shopOffer`'s per-item `weight` alongside `itemThemeWeight`), NOT the rng draw COUNT (one
    `rng.float()` per pick regardless), so the offer stays deterministic + resume-stable and every
    existing shop/club/caddy seed-scan test passes byte-for-byte.
  - **Each WORLD has its own named Pro (`PROS` in `zones.ts`, content-as-data).** One Pro per
    archetype (Birdie Bellamy/verdant, Sandy Dunes/desert, Hailey Frost/frost, Ember Stokes/inferno,
    Orbit Vance/void), each with a name, title, and pithy greetings keyed by `ProMood`. You only reach
    a shop after PASSING the cut, so `proMood(stableford, cut)` grades degrees of SUCCESS by the
    Stableford/cut ratio (`scraped <1.25 · solid <1.7 · great <2.2 · stellar`) — a nervy scrape up to
    a romp, never a failure. On top of the grade, the Pro reacts to the section's DRAMA: `sectionEvents`
    (pure, over a minimal `HoleOutcome` slice of the played holes) detects an `ace`/`eagle`/`blowup`
    (picked-up or ≥4 over)/`birdieBlitz` (≥3 birdies), and `proLine` prefers the highest-priority event
    line (`PRO_EVENT_PRIORITY`) the Pro has, else the mood line — so a hole-in-one or a disaster gets a
    bespoke, world-flavoured callout. `app.ts` `proGreetingHTML` reads `state.lastResult` + `state.played`,
    resolves the Pro via `archetypeFor`, and draws an assetless inline-SVG bust (`proAvatarSVG`,
    per-archetype palette) + name + `proLine` line (salted by `stopIndex` so it varies). Pure data +
    view-only render → no new `_gs*` hook, no save bump; `tests/pro-shop.test.ts` guards the
    roster/moods/quip+reaction determinism, event detection, the depth-bias curve, and the early>deep
    common-count fix.
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

## Competition field, leaderboards & matchplay bosses (GS-100)
You travel the galaxy in a **field** of golfers, not alone. Three layers, all pure/deterministic.
- **The roster (`src/sim/rpg/golfers.ts`).** ~18 `GOLFER_ARCHETYPES` (style templates grounded in real
  golf — bomber/plotter/fader/drawer/iron-surgeon/wedge-wizard/putting-magician/sand-saver/escape-artist/
  iceman/streaky/wind-master/power-athlete/metronome/flop/grinder/maverick/all-rounder), each a 0–1
  `GolferProfile` (skill/power/accuracy/shortGame/nerve/consistency/wind/shapeBias/flight) + an avatar
  palette. ~152 `GOLFERS`: **28 constellation champions** (one per constellation theme, named off its
  anchor star, `home` = that theme), the 4 playable characters mirrored in as rivals (`mirrorsCharacter`,
  can boss when unchosen), and a deterministically-built field of 120 (FNV-1a `golferHash`, no
  `Math.random`). `golferProfile(id)` = archetype base ± per-golfer jitter; `bossShotMods(id)` /
  `golferDistanceBonus(id)` derive a golfer's REAL shot behaviour for boss play; `championFor(themeId)`.
  A new golfer is a new row.
- **The ghost leaderboard (`src/sim/rpg/competition.ts`).** THE DESIGN CALL: the field is a deterministic
  STATISTICAL ghost, not 20 real ball-sims per hole (slow + untunable). `ghostHoleStableford` centres a
  golfer's per-hole Stableford on a FIXED quality band (`golferBaseline`, rating 0→0.6 … 1→2.6 SF/hole),
  widened for inconsistent/streaky golfers, lifted by a strong `HOME_BOOST` in a champion's own zone and
  by clutch under boss `pressure`. The cut (`effectiveCut`, unchanged) RISES with distance, so it scythes
  more of a fixed-quality field over time — "harder and harder" for free, WITHOUT touching course
  generation (the fairness/no-death-spiral validators are untouched). `buildField(seed,arcIndex,arc,player)`
  = 20 golfers (you + arc champions + unchosen characters + a seed-stable random-SAMPLE fill), seed-stable
  so nothing new persists. `arcStandings`/`applyCut`/`bossPick` (the boss = the top non-player, i.e. #2 if
  you lead). FIELD SPREAD (GS-cut-curve): the fill is a plain seeded shuffle SAMPLE, NOT the top-by-skill —
  the old fill sorted the pool by skill descending, so the field was always the STRONGEST 19 (an elite
  cluster, all ~2.0–3.2 SF/hole) with no weak tail for the cut to bite, so the leaderboard never thinned.
  Field-tier golfers carry no `homeArchetype`, so that sort was pure skill bias (the home-weighting did
  nothing); a uniform sample restores a natural ability spread (weak field golfers ~1.7/hole up to
  champions ~2.5/hole) so the ramping cut sweeps the tail first and eats upward. CRITICAL: a golfer's
  ghost score never depends on the field's composition, so this changes WHO gets cut, NOT the player's own
  difficulty (player pass% is byte-identical) — a "free" improvement to leaderboard thinning. Champions are
  still seeded first (step 2) and keep their HOME_BOOST, so the home champion still tops their own zone.
- **The run glue (`src/sim/rpg/league.ts`).** Groups stops into ARCS (`ARC_LEN` 3), builds the arc field,
  and computes the cumulative `leaderboard(run)` from the player's REAL per-stop Stableford (`run.history`)
  + ghost scores. `livePosition(run, holesPlayed, playerStopSF)` feeds the per-hole "you're Nth" play-HUD
  chip (updates as each hole finishes). `arcBossId(run)` = the leader going into the boss slot.
  CRITICAL: league imports `run.ts`; `run.ts` NEVER imports league (no cycle). The matchplay boss-id is
  resolved in the UI REDUCER (which can see the leaderboard), passed into the pure match engine.
- **Matchplay bosses (`src/sim/rpg/match.ts`).** A boss `mode: 'matchplay'` (voyage Arc-I + FINAL; the
  Arc-II boss stays co-op scramble for variety) is a 1-on-1 DUEL vs the leaderboard leader on the actual
  course. The boss is a REAL ball: `bossLoadout`/`bossPlayOpts` give it the balanced bag + a power-derived
  distance bonus + a skill-derived handicap + its own `bossShotMods` shape, played through `playHole` on a
  SEPARATE rng stream — so the player's own ball is byte-for-byte identical to a non-boss stop (the
  no-death-spiral bar is untouched; matchplay only changes the PASS gate, not the player's shots).
  `matchState` rolls hole-by-hole duels into "2 UP / 3 & 2 / halved", decided the moment one side is up by
  more than remain; `finishStop(run, course, played, { matchWon })` passes on the duel (credits still from
  your Stableford). The reducer pre-plays the boss's stop and scores each hole on `holeComplete`, finishing
  early when decided. Render: opponent badge on the boss intro, a live match HUD, a duel result panel
  (verdict + W/L/½ pips). The boss's pre-played shot trail for the current hole is overlaid MUTED on the
  play map (`renderHoleSVG.ghostShots`) and the HUD shows "Boss made N here" so you have feedback on their
  ball/score. Tests: `tests/golfers|competition|league|match.test.ts`.
- **Survival is your PLACE in the field — the leaderboard IS the cut (GS-positional-cut).** A WINNABLE
  campaign (the voyage) is a FIELD competition, so you no longer survive an ordinary stop by clearing an
  abstract Stableford line — you survive by finishing in the TOP-N of the arc leaderboard (`ARC_CUT_TARGETS
  = [18, 16]`: top 18 advance the first stop, top 16 the second), and the boss stop is a matchplay
  KNOCKOUT. The engine is pure in `competition.ts`: `sliceScores` (player's real SF + each ghost's
  form-shifted SF per stop, boss stops score 0) and `arcCut` (walk the arc, after each ordinary stop keep
  the top-`target` by cumulative total, freeze + sink the rest) — the SINGLE source of truth for BOTH the
  displayed board (`league.leaderboard`→`positionalLeaderboard`) and the player's survival
  (`run.finishStop`→`playerSurvivesStop`), so the drawn cut and the real cut can NEVER disagree. To avoid a
  league↔run cycle, the arc grouping helpers + `arcCut` live in `competition.ts` and the slice builder
  (`arcSlices`) lives in `run.ts` (league imports it back). Ascension tightens the targets (fewer advance,
  floored at 8). Endless formats (flat/ladder) are UNCHANGED — they keep the Stableford cut for both
  survival and display (`stablefordLeaderboard`); `Leaderboard.mode` distinguishes them. The boss round
  adds NO Stableford to anyone's arc total (so beating the #1 can't leave you trailing them on points) and
  pairs the field best-vs-worst — `bossOpponentFor` gives the player their RANK-MIRROR (#1 v last, …), so a
  strong arc earns a weaker opponent and a scrape draws the leader. Headless `playStop` plays the matchplay
  boss as a real duel too (same opponent + two rng streams as the reducer), so auto ≡ interactive. BALANCE:
  the competition is calibrated around the field median (~2.1–2.2 SF/hole); outscore the field to advance +
  earn favourable boss draws. It's a genuine, hard tournament — the auto reach-AI floor (a deliberately weak
  proxy at ~2.08/hole, just below median, that barely exploits upgrades) wins the voyage rarely (~2–3%);
  interactive play that beats the field median ranks top, draws weak boss opponents, and wins much more.
  `voyage.test`'s "can win" stays loose (a knockout bracket is inherently swingy — don't assert a hard win
  rate). Tune via `ARC_CUT_TARGETS`, the field strength (`golferBaseline`), or the boss stat edge
  (`bossLoadout`). Tests: `tests/competition` (arcCut/targets/pairing), `tests/league` (boss-no-Stableford),
  `tests/voyage` (termination + winnable).
- **The voyage field is ONE persistent field that thins to the final TWO (GS-voyage-field, supersedes the
  per-arc cut above).** The field used to REBUILD every arc (`buildField(seed, arcIndex, …)`) and reset
  `ARC_CUT_TARGETS = [18, 16]` each arc — so the leaderboard reset between acts and a boss board could
  read a Stableford number as a nonsense "top 22 advance". Now a WINNABLE voyage builds ONE 20-golfer
  field for the whole journey (`buildVoyageField(seed, player)`, champions spanning all three arcs) and the
  positional cut is CUMULATIVE across the voyage, ramping the survivor target down
  `VOYAGE_SURVIVOR_TARGETS = [16, 12, 9, 6, 4, 2]` over the six ordinary stops (`arcSurvivorTarget` now
  indexes by `ordinaryStopOrdinal`, undefined on a boss slot, floored at 2 under Ascension) — so exactly
  TWO remain (you + one rival) going into the final, a true 1st-vs-2nd matchplay. Both league (`runField`)
  and run (`survivalField`) route winnable formats through `buildVoyageField`, and `arcSlices` now spans
  the WHOLE history (not the current arc), so the cumulative total grows continuously with NO per-arc
  reset/jump (a completed stop adds exactly the live partial — `tests/voyage-field` guards field stability,
  the ramp-to-two, and score continuity). Endless flat/ladder keep the per-arc field + Stableford cut,
  byte-for-byte. The leaderboard divider reads "⚔ boss round" on a positional boss stop (never a stray
  "top N advance"). Tune the ramp via `VOYAGE_SURVIVOR_TARGETS`.
- **Boss-reward TALENTS — pick a run buff or a permanent reward (GS-talents).** Beating a NON-final boss
  opens a reward screen: choose ONE of a thematic run **talent**, a generic run talent, or a permanent
  **Star-Shard** bonus (the "talent or permanent reward for this run" ask). Talents (`TALENTS` in
  `economy.ts`) are `ShopItem`s flagged `talent: true` and kept OUT of `SHOP_ITEMS`, so the rotating shop
  never sells them; each themed one carries a zone `archetype` (`talent-ember`/inferno power,
  `talent-iceveins`/frost precision, `talent-dunewalker`/desert lie-relief, `talent-voidfocus`/void
  shaping, `talent-fairwaymaster`/verdant) so a boss in that world offers its signature power. `bossRewards
  (run, archetype, salt)` (run.ts) draws the 3 deterministic choices (themed + generic + a depth-scaled
  shard reward), skipping talents you own; `grantTalent` applies one FREE (no credit cost). A talent reuses
  the perk machinery — `shopItem`→`talentItem` resolves it, so it's added to `loadout.perks` and rebuilt on
  resume exactly like a bought perk (NO save bump). UI: a new `bossReward` screen between the result and the
  shop (the result Continue routes there when a reward is pending); `pickBossReward` applies the choice
  (talent → `grantTalent`, shards → `state.shards`) and proceeds to the shop. The reward is detected in the
  reducer (`bossRewardFor`: a survived, non-final boss win) for BOTH the matchplay and scramble bosses. No
  new `_gs*`/URL hook (the test-hub guard needs nothing; the Sim Lab absorbs the talents as data).
  Tests: `tests/talents.test.ts` (talents out of the shop, perk rebuild, themed/deterministic draw, free
  idempotent grant, the reducer pick→shop flow).
- **A hole-in-one is the game's biggest moment — a full-screen celebration + a carry-forward reward
  (GS-ace).** An ACE is the tee shot holed (`holed && strokes === 1`), astronomically rare, so it pays a
  real jackpot in THREE layers. The reward is applied in the PURE `finishStop` (so the auto sim and the
  interactive player reward an ace byte-for-byte identically, guarded): (1) a flat **credit jackpot**
  (`ACE_CREDIT_BONUS` 40 per ace, folded into `creditsForStop`'s pre-multiplier `bonusFlat` so it
  COMPOUNDS with credit perks exactly like a relic — paid on a passed stop); (2) a **stacking precision
  talent** ("Ace's Touch", `ACE_TALENT_ID 'talent-ace'`, −8% `dispersionMult` per ace) granted via
  `grantAceTalent` — it pushes the perk id once per ace so `loadoutFromPerks` rebuilds the exact stack on
  resume (NO save bump for the run side). The talent lives in `TALENTS` with `archetype: 'ace'` so
  `talentsForArchetype` excludes it from BOTH the themed and generic boss draws (it's ace-only, never
  offered) yet `talentItem` still resolves it for resume. `StopResult.aces` records the count. A precision
  boost can only EVER help scoring, so it can't trip the no-death-spiral bar (the full suite stays green —
  aces don't occur in the seeded balance sims, so no seeded-number test shifted). (3) A **lifetime ace
  tally** (`save v5` `lifetimeAces`, migrated v4→v5) — a permanent cross-run record shown on the title;
  the reducer banks `result.aces` into `state.lifetimeAces` at every stop completion (the single
  chokepoint that sees both watched + interactive aces). The **celebration** is a cosmetic app.ts
  side-effect (like the loading intro / play-view canvas — NOT in the reducer, so determinism is
  untouched): `showAceCelebration` mounts a fixed full-screen overlay with a seeded Canvas2D fireworks +
  confetti show (`runAceFireworks`, mulberry32, NO `Math.random`; the loop self-stops on `!canvas.isConnected`
  so it can't orphan a rAF), a gold "HOLE IN ONE!" headline, the reward reveal, and a Continue button →
  `onDismiss` renders the normal end-of-hole screen (which confirms the reward in an `aceNote`). Fired from
  the play-view `onDone` when the terminal shot is an ace, guarded once-per-hole (`aceCelebratedHole`,
  reset per hole in `render`); reduced-motion drops the rAF loop (a static card). New cue `sfx.ace()` (a
  grand fanfare) + `HAPTICS.ace`. NB: NO new `_gs*` flag or `?param` — the celebration timing rides the
  existing `_gsFeel` (`aceDelayMs` sub-field), so the test-hub guard needs no new control. Tests:
  `tests/ace.test.ts` (count/credit/talent helpers, ace-only talent, `finishStop` pays + applies +
  records, no-ace no-regression, snapshot/resume rebuild) + `tests/save.test.ts` (v5 migration).
- **Pro Shop expansion: golf-themed gear, new gameplay items, themed club sets + procedural images
  (GS-proshop-2).** Four coupled pieces, all default-OFF so a base loadout is byte-for-byte unchanged in
  the sim (the determinism contract — proven by the full suite staying green):
  - **Golf vocabulary rename.** The space-y item NAMES were re-themed to real golf gear (ids unchanged
    for save-compat, only `name`/`desc`): Gyro Stabiliser→Counterbalance Shaft, Power Cell→Graphite Power
    Shaft, Range Booster→Distance Balls, Precision Chip→Tour Glove, Lucky Coin→Lucky Ball Marker, Fortune
    Chip→Sponsor's Badge, Distance Control→Stiff Tour Shaft, Overdrive→Speed Whip Shaft, Glass Cannon→Grip
    It & Rip It. Tests assert ids, never names, so this is free.
  - **New gameplay-changing items + 3 new `PlayerLoadout` fields**, threaded IDENTICALLY through the auto
    sim (`playStop`→`playHole`→`executeShot`) and the interactive driver (`takeShot`/`previewShot`) so
    auto≡interactive holds; each absent/0 ⇒ no extra rng, byte-for-byte: (1) **`windResist`** (Wind-Cheater
    Balls, stackable→0.6) scales DOWN BOTH the wind's carry loss + crosswind push in `resolveShot` AND the
    upwind compensation in `aimWithWind` by the same factor, so wind bites less without desyncing the aim;
    (2) **`backspinBoost`** (Spin-Milled Wedges) subtracts from the roll fraction in the SAME single
    roll-energy draw (more check, less run); (3) **`hazardImmune: string[]`** (Floater Balls→water, Magma
    Skimmers→lava, Void-Walkers→void+voidlost) — a penalty kind the ball SKIMS across with NO stroke:
    `rollOut` treats an immune penalty as a fast skim surface (`SKIM_ROLL`) and keeps rolling toward dry
    ground; if it stops IN the hazard, `skimToDry` relocates it to the near bank (no stroke). Pure geometry,
    no rng. Plus golf-vocab items reusing existing fields: Laser Rangefinder (`clubSuggest`, interactive
    read), Tour Spikes (a weaker `lieRelief` 0.35). Hazard balls can only REMOVE penalties → strictly
    help/neutral scoring (no death-spiral risk; the auto floor uses base loadouts so seeded sims are
    unaffected). Wired into `ShotInput`/`ExecOpts`/`PlayHoleOptions`/`playerHoleOpts`/`shotSpread`.
  - **Club sets themed by rarity (the user's ask).** `CLUB_SETS` labels re-themed + a new legendary set
    (set IDs stable for save-compat, stats/roles UNCHANGED so club-rewards balance holds): rare = **Planet**
    (`tour` distance + `pro` scoring), epic = **Phoenix Flames** (`masters` distance), legendary = **Solar
    Storm** (NEW `solar` distance, +24 carry). Each set row carries `theme`/`tint` (render-only) — the seam
    for "later, different sets are better at different things". `equippedGearTheme(loadout)` returns the
    RAREST themed set the bag carries.
  - **Procedural item images (`render/itemArt.ts`) + avatar gear (the "image changes your avatar" ask).**
    `itemArtSVG(id, rarity, setTheme)` is an assetless, deterministic SVG per item (house no-404 rule):
    the art KIND is resolved from the id (shaft/ball/glove/coin/putter/shoes/rangefinder/wedge/coach/trophy/
    caddy) — clubs draw a themed head (Planet ringed planet / Phoenix flame / Solar Storm sun rays); flavoured
    balls (water/lava/void/wind/distance) read by tint+effect. Rendered atop each Pro Shop card via
    `itemCardHTML`'s new `artSVG`. The SAME themed look feeds the SWING: `GolferLook.gear` (resolved in
    `app.ts golferLook()` from `equippedGearTheme`) makes `drawGolfer` swing a GLOWING themed club head with
    trailing sparks — so the club you BUY is the club you swing. Render-only, NO new `_gs*`/URL hook (the
    test-hub guard needs nothing; the Sim Lab absorbs the new items as data). Tests:
    `tests/proshop-expansion.test.ts` (field apply/stack/cap, hazard-immunity behavioural proofs per biome
    + no-regression, solar set + `equippedGearTheme` rarity pick, deterministic art for every item).

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
  guard), **Convict Sheep** (`convict-sheep`, legendary — right-side guard), **Suggestible Sam**
  (`suggestible-sam`, epic — `clubSuggest`, see below). Helpers: `NAMED_CADDY_IDS`,
  `isNamedCaddy`, `namedCaddyOwned(perks)`.
- **Suggestible Sam — club suggestions are a caddy perk (`clubSuggest`) AND a real scoring edge
  (`confidenceMod`).** Two coupled effects, both off hiring Sam:
  - **(1) The EXPLICIT suggestion affordances are Sam's — the smart DEFAULT club is everyone's.** The
    interactive 🎯 Suggested snap-back button and the legend's `suggested: attack X · safe Y` readout
    only appear with Sam. BUT the default-selected club is the green-coverage `suggestPlayerClub` pick
    (longest club that still STOPS on the green) for EVERYONE, not just Sam. Gating the default club too
    was an overcorrection: it handed the base flow the LONGEST usable club, so a non-Sam approach
    defaulted to the driver and flew the green — the exact overshoot `suggestPlayerClub` exists to
    prevent. Sam sells the precise read (the explicit button + readout + yardages) and the confidence
    edge, NOT "don't overshoot by default". (Putter is still the green default for all.)
    `suggestPlayerClub`/`shotView.attackClubId` are unchanged and still computed — `app.ts` just GATES
    the explicit affordances on `loadout.clubSuggest` while using the pick as the default club always.
    Sam also surfaces a **caddy yardage read** (a 🎒 Sam line
    on the play screen): precise front/middle/back green distances (`greenDepth` + centroid dist) and
    the carry to clear the nearest forced penalty on the line to the pin (`forcedCarry`, a pure
    line-vs-penalty sampler in `round.ts` — info only, never feeds fairness/scoring).
  - **(2) Club confidence — commit to Sam's club and swing freer.** `loadout.confidenceMod`
    (`SAM_CONFIDENCE`, a green-zone `ShapeMod` trimming all four miss zones) is folded into a shot's
    spray shape ONLY when the played club is the one Sam suggested — so the cone VISIBLY tightens on the
    recommended club and you forfeit the boost if you override for a tactical placement (a real
    decision). It's threaded into BOTH the auto sim (`PlayHoleOptions.confidence` → `playHole` computes
    `suggestPlayerClub` and applies iff `aiClub === suggested`) and the interactive driver
    (`takeShot`/`previewShot` compute the same and apply iff the chosen club matches) under the
    IDENTICAL rule, so auto≡interactive holds. The fold is `resolveShape(combineShapeMods(shapeMod,
    confidence), charShape)` in `executeShot` AND `shotSpread` (so physics == the previewed cone).
  CRITICAL determinism: confidence is a SHAPE change (no new rng draws — it just re-weights the
  categorical zone pick), so a NON-Sam shot (confidence undefined) is byte-for-byte unchanged, and the
  gate (`confidence && suggestedClubId === club.id`) means an off-suggestion shot is identical too
  (guarded in `tests/caddies.test.ts`). Because it only ever raises green %, it can't trip the
  death-spiral bar; its value is proven by a FOLLOW-SAM headless harness (play `shotView.attackClubId`
  each shot via `takeShot`) showing higher mean per-stop Stableford. Both fields rebuild from perks on
  resume (no save bump). Render: `drawSuggestibleSam` offers a club aloft with a yardage thought-bubble.
- **Generic caddy 'service' perks gate behind hiring a named caddy.** `caddie-lesson` is `caddy:
  'service'`: `shopOffer` only surfaces a service perk once `namedCaddyOwned(perks)` is set — you need a
  caddy before they'll give you lessons. (It still stacks/works exactly as before once unlocked.)
- **The guard caddies redirect a sampled miss to the green MID-FLIGHT — they do NOT reshape the spray
  (`CaddyGuard` in shot.ts, distinct from `ShapeMod`).** The cone still shows the miss tails; what
  changes is that a shot already SAMPLED into a tail gets knocked back. `resolveShot` classifies the
  sampled angle's zone (`classifySprayZone`) and, if a guard is present, looks up that zone's redirect
  CHANCE (`guard.redirect[zone]`): a chance ≥1 ALWAYS redirects to a fresh green-band angle (no roll), a
  fractional chance rolls once, an absent/zero zone does nothing. **Space Ducks** =
  `{redirect:{duckHookL:1, hookL:0.75}, kind:'laser'}` (every duck-hook gone; 75% of hooks saved);
  **Convict Sheep** = `{redirect:{shankR:1, sliceR:0.75}, kind:'boomerang'}` (the right-side mirror).
  On a redirect, `ShotResult.redirect = {kind, fromZone, originalLanding}` records the would-be miss so
  the renderer animates it. CRITICAL determinism: the guard's extra rng draws (the chance roll + the green
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
  break the birdie/eagle balance; it's a chip-in near the pin.) Dr Chipinski is **legendary** (a chip-in
  near the pin is a big swing), so he's epic-scarce in the offer like the other game-changing caddies.
- **Caddy effects play in SLO-MO with a voice line + speech bubble (GS-caddy-voices / GS-caddy-slomo,
  `playView.ts` + `speech.ts` + `caddyArt.ts`).** When a caddy's signature effect fires — a guard
  laser/boomerang redirect, or a Dr Chipinski chip-in — the play view drops its clock to `CADDY_SLOMO`×
  real time for `CADDY_SLOMO_MS` of VIRTUAL time so the throw/drop is NOTICEABLE, and pops the caddy's
  catchphrase as an on-screen `drawSpeechBubble` (Dr Chipinski also gets a ringing "answering a call"
  `drawPhoneIcon`) while `app.ts`'s `onCaddyEffect` speaks it via the browser Web-Speech synth
  (`speakCaddy`, ZERO downloaded audio — the house rule) in the caddy's accent: Dr Chipinski "You rang?"
  (en-US), Convict Sheep "She'll be right, mate." (en-AU), Space Ducks "Tally ho, good shot!" (en-GB);
  data lives in `CADDY_VOICE`. CRITICAL: the slo-mo is a VIRTUAL animation clock (`vnow += dt × scale`)
  — it only stretches the wall-time of the EXISTING animation, never the sim, so determinism + every sim
  test is untouched; the constants are plain module consts (like `ARC_FEEL`), NOT `_gsFeel` fields, so
  no new hook to wire (the test-hub guard needs nothing). The play view now takes the FULL hired caddy id
  (`opts.caddyId = caddyId()`, not just the guard) but still only draws a GUARD persistently in the corner
  (`caddyProjectile` gate — the no-clutter rule); a non-guard caddy (Dr Chipinski) appears in the corner
  TRANSIENTLY only during its callout, so the chip-in shows the doctor + phone + bubble then vanishes.
  Voice is gated on the `sound` setting + fully guarded (silent where unsupported).
- **The guard redirect is a SLOW-MO ZOOM-TO-IMPACT cinematic where the projectile actually HITS the ball
  (GS-caddy-impact, `playView.ts`).** The redirect used to fire the laser/boomerang on a SEPARATE fixed
  clock (`t0`/`dur`) toward a FROZEN screen point, so under slo-mo (and with the follow-cam panning) the
  throw sailed past the still-moving ball — "it no longer hits the ball." Now the projectile is tied to
  the BALL's flight progress `tg`: the caddy looses it at `REDIRECT_FIRE_FRAC` (0.28) and its travel
  `p = (tg − fireFrac)/(hitFrac − fireFrac)` reaches 1 exactly at `REDIRECT_HIT_FRAC` (0.5) — the
  intercept — so it MEETS the ball (the ball is at that same curve point at `tg=0.5`). The target screen
  point is RE-projected every frame (`redirectDraw`, recomputed in the cinematic, drawn over the ball),
  so camera pan/zoom can never desync it (the old frozen `to` drifted). At contact: a `spawnSparks` spray
  (cyan laser / warm boomerang, deterministic, no `Math.random`) + an expanding shock ring, and the
  camera ZOOMS in (`cineZoom`, a `buildProj` viewRadius multiplier eased to `REDIRECT_ZOOM` 0.6 over the
  approach and back out on the knock-back). Slow-mo still rides #121's global virtual clock
  (`CADDY_SLOMO`, bumped `CADDY_SLOMO_MS`→1050 so the whole arc + early roll are slowed). The speech
  bubble now points at the caddy's HEAD (`caddyHead`), not its weapon hand, so it sits cleanly above the
  figure (was "a bit off position"). All render-only feel (module consts, no `_gsFeel`/hook) — sim +
  tests untouched; the impact animation is canvas feel → verified eyes-on.
- **The framed caddy badge shows on the WATCH screen too (GS-caddy-display), and the frame is FLASHY.**
  The hired caddy's gold-framed badge was decision-screen-only; it now also floats bottom-RIGHT on the
  live shot (watch) screen (`gs-hud-watchcaddy`, clear of the play-view's bottom-left corner caddy + the
  top-left info chip) so the border reads the whole shot. The `.gs-caddybadge` frame got a real glow-up: a
  pulsing gold glow (`@keyframes gs-caddyglow`), a slow rotating gold sheen behind the figure
  (`::before` conic-gradient, `gs-caddyspin`), a warm radial backdrop + glowing name — gated by
  `prefers-reduced-motion`. CSS-only; verified eyes-on.
- **Render (`render/caddyArt.ts`, eyes-on feel).** The hired caddy is drawn as a self-contained Canvas2D
  figure (house "no asset" style), but WHERE it shows is scoped to where it has a role (GS-caddy-display):
  the decision screen always shows the hired caddy in its framed gold badge (`caddyBadgeHTML` →
  `.gs-caddybadge`, the "cool outline"); the LIVE play view's bottom-left corner shows ONLY a guard
  caddy (`flightCaddyId` = `caddyProjectile(id) != null` — Space Ducks / Convict Sheep, the only ones
  with a flight-time job firing the redirect laser/boomerang), since any other caddy looming over the
  ball-in-flight just clutters it (and it's already in the decision badge); and the PUTTING screen shows
  ONLY a putting specialist in the SAME framed badge (`puttCaddyId` = `isPuttingCaddy(id)` →
  Penelope/Mystic Mole, `PUTTING_CADDY_IDS` in economy) — a distance/guard caddy like Driver Dan has no
  role on the green. The putt meter itself no longer draws a figure (it uses its full width); the badge
  sits beside it. Both framed badges are one generic render pass (`canvas.gs-caddycv[data-caddy]`) so
  every screen draws identically. Figures: Penelope (teal caddy + flag), Driver Dan (burly + big driver), Dr
  Chipinski (lab coat + wedge), Space Ducks (bubble-helmet duck + top hat + laser rifle), Convict Sheep
  (striped jumpsuit + boomerang). On a redirect, `playView` flies the ball toward `originalLanding`,
  fires the caddy's projectile (`drawCaddyProjectile` — laser beam / spinning boomerang) from the
  figure's muzzle anchor mid-flight, then kinks the GROUND path back to the green (the loft arc is one
  continuous parabola, so only the ground bends — the "zapped" read). All caddy feel reuses existing
  knobs/no new `_gs*` flag, so the test-hub guard needs no new control; the Sim Lab absorbs the new
  shop items automatically.
- **Caddy effects are testable in the harness — DEMO the throw + VERIFY the rate (GS-caddy-test).** The
  guard interception only fires on a rare right/left miss, so in normal play you can go a whole run
  without seeing the boomerang/laser. Two harness affordances close that (and the rule below keeps every
  caddy covered): (1) DEMO — `_gsFeel.forceRedirect` (`'' | 'boomerang' | 'laser'`, a `_gsFeel`
  SUB-FIELD so NO new top-level hook) forces a caddy-guard interception on EVERY shot in the live play
  view: it shows the guard caddy in the corner even if none is hired and FABRICATES a render-only
  redirect (`fabricateRedirect` in `playView.ts` — pure, no rng, no sim/score change) for any shot the
  sim didn't already redirect, so the throw can be watched on demand. The hub's Demo panel drives it
  (🪃 Convict Sheep / 🔫 Space Ducks / Off). (2) VERIFY — the Sim Lab's `dispersionStudy` now threads
  the built loadout's `caddyGuard` + `lieRelief` through `resolveShot`, so a guard caddy's redirects
  sample for real: it reports `redirectRate`/`guardKind` and the scatter draws each would-be miss (red)
  with a line to the saved green landing. And `caddyEffects(loadout)` (pure, in `lab.ts`) names every
  active caddy/loadout effect (autoPutt / driverAnywhere / chipInBoost / caddyGuard / clubSuggest /
  lieRelief / puttBoost), surfaced in the hub's loadout stats so toggling any caddy SHOWS what it
  changed. THE RULE (machine-checked): every named caddy folds a field into the loadout, and
  `tests/lab.test.ts` asserts each id in `NAMED_CADDY_IDS` surfaces a `caddyEffects` row — add a caddy
  with no Lab effect and the build reds. A guard/visual caddy additionally needs a `_gsFeel.forceRedirect`
  case + a Demo button.
- **Sandy the Sand-Saver — escape specialist (GS-mux, a NEW shot mechanic `lieRelief`).** A `loadout.
  lieRelief` (0..1) LERPS a BAD lie's `carryMult`/`dispersionMult` back toward neutral (`reliedLie` in
  `shot.ts`) — rough/sand/waste/trees recover far better — and NEVER touches a clean lie (carryMult 1 /
  dispersionMult ≤ 1 are unchanged). Threaded IDENTICALLY through `resolveShot`, `shotSpread` (so the
  cone reads true), `executeShot`, `playHole`/`playStop` (auto) AND `takeShot`/`previewShot`
  (interactive), so auto≡interactive holds. CRITICAL determinism: `reliedLie(li, undefined)` returns the
  lie's EXACT values and consumes NO rng, so a relief-less shot is byte-for-byte unchanged (the caddy-
  field contract). It changes carry VALUES, not the 2-draw budget, so the rng stream is stable. Sandy
  pairs with the new lie-awareness chip (you SEE the bad lie, a caddy digs you out). `SANDY_LIE_RELIEF`
  0.6. Guarded in `tests/caddies.test.ts` (absent = byte-for-byte, clean lie unchanged, more carry out
  of rough).
- **Mystic Mole — green-reader (GS-mux).** Rides the EXISTING `puttBoost` field (`MOLE_PUTT_BOOST` 0.32
  — a big manual make-band + lag lift), so it needs no new sim thread and is covered by the putting
  guards. Distinct from Penelope (who AUTO-putts): the Mole rewards MANUAL putting skill instead of
  replacing it. Both new caddies get assetless `caddyArt` figures (Sandy: bush hat + wedge + sand spray;
  Mole: spectacled mole on a dirt mound with a putter), are mutually-exclusive named caddies
  (`NAMED_CADDY_IDS` auto-derives), and rebuild from perks on resume (no save bump).

## Feedback & mobile UX layer (GS-mux — audio, haptics, settings, juice)
A pure side-effect layer over the reducer (like the play-view canvas + save persistence); the sim is
untouched, so determinism + all sim tests are unaffected. NONE of it adds a top-level `_gs*` flag or
URL param (dev knobs ride the existing `_gsFeel` sub-fields), so the test-hub guard needs no new control.
- **Assetless audio (`render/audio.ts`).** A WebAudio synth — every cue (contact, putt, hole-out,
  made/missed-cut, penalty, reward, UI click) is built from oscillators + filtered noise at call time,
  ZERO downloaded files (the house no-404 rule). Lazy `AudioContext`, resumed on the first user gesture
  (`resumeAudio()` in `dispatch`), gated on the `sound` setting, fully guarded (no-op without WebAudio).
  The contact cue fires at the TRUE strike moment via a new `playView` `onImpact(kind, quality)` hook
  (quality from the shot's straightness → a pure strike rings, a wild one thuds). Big-beat cues
  (made/missed cut) fire on the screen transition in `dispatch`; hole-out/penalty in the animation
  `onDone`.
- **Haptic vocabulary (`HAPTICS` in `app.ts`).** Named patterns (tap/swing/putt/good/bad/holeOut/
  madeCut) gated on the `haptics` setting + guarded (absent on desktop/iOS) — so the game is readable
  with sound off.
- **Settings (`src/settings.ts` + a bottom-sheet overlay).** Player-owned prefs persisted to
  localStorage `gs_settings` (NOT reducer state): `sound`, `haptics`, `fastShots`, `swingGesture`,
  `leftHanded`, `reducedMotion` (seeded from the OS preference). Reachable via ⚙ on the title + the
  play-screen map controls; toggles re-render live.
- **Left-handed mode is a true MIRROR, not a cosmetic flip (GS-lefty).** A left-handed golfer is the
  mirror image of a right-handed one — their hook curves right, slice left, and a character's baked
  fade/hook flips — so on a FIXED course (layout unchanged) a lefty's misses go the opposite way.
  Implemented as a SINGLE lateral-sign on the FINAL shot angle (spray + bias) in `resolveShot`'s
  `landAt` (`h = lefty ? -1 : 1`), applied AFTER the rng draws and AFTER the canonical-frame guard
  classification — so EVERYTHING internal (the SprayShape zones, the caddy guard's `duckHookL`/`shankR`
  targeting, the character `angleBias`) stays in one right-handed canonical frame and the ONE sign maps
  it to world space. CRITICAL invariants: (1) ZERO extra rng — `lefty:false`/undefined is byte-for-byte
  right-handed (the whole existing suite is the guard); (2) crosswind (`windLat`) is NOT flipped — it's
  world-fixed, independent of stance, so wind shifts the cone the same way for both hands; (3) by mirror
  symmetry, mirroring the PLAYER equals mirroring the COURSE (a seed relabelling), so it's BALANCE-NEUTRAL
  — `tests/lefty.test.ts` proves mean per-stop Stableford matches righty within noise, so the
  no-death-spiral bar is untouched. Threaded as `loadout.lefty` IDENTICALLY through the auto sim
  (`playStop`→`playHole`→`executeShot`) and the interactive driver (`takeShot`/`previewShot`) so
  auto≡interactive holds. It's a SETTING, not a perk: the pure sim can't read localStorage, so `app.ts`
  bakes the live setting onto `loadout.lefty` in `render()` (the settings→sim bridge) — NOT serialised,
  re-derived on resume, so NO save bump and NO `_gs*`/URL hook (the test-hub guard needs nothing). The
  preview cone mirrors via `ShotSpread.lefty` (holeView negates the band angles + the bias rotates the
  other way) so the graphic stays == the physics; the % labels ride their zones (hook% still shows where
  a lefty's hook goes). Render mirrors (cosmetic, the flight already comes out mirrored from the sim):
  `drawGolfer` swings left-handed (mirror the figure about the ball), `drawCaddy` mirrors the figure +
  its muzzle anchor, and the `.gs-shot--lefty` CSS moves the floating map controls left + reverses the
  aim segment / Hit bar (the club ◄/► arrows keep their direction). Re-run `tests/lefty.test.ts` after
  any `resolveShot`/`shotSpread`/`holeView` spray change.
- **Lie awareness on the DECISION bar (the per-shot-popup concern).** A colour-coded `lieChip` (🟢 ok /
  🟠 caution / 🔴 trouble) with the lie's carry+spray effect sits in the play top bar — shown exactly
  when you pick the next shot, so losing/skipping the result popup no longer loses lie awareness.
- **Fast Shots + the result popup.** Default: the per-shot result card waits for a tap (whole backdrop
  dismisses). `fastShots` auto-advances after a beat (`_gsFeel.fastAdvanceMs`), relying on the always-on
  lie chip. The popup/celebration timing all live on `_gsFeel` sub-fields (no new flag).
- **Opt-in pull-back swing gesture (`wireSwingPad`).** With `swingGesture` on, the Hit control becomes
  a backswing pad: drag DOWN to load a power meter (ratcheting haptic), release past the commit
  threshold to swing. PURE FEEL — the released swing fires the SAME action the Hit button would (club +
  aim define the shot), so the sim is untouched. A short pull cancels.
- **One-row SEGMENTED aim control + celebrations + momentum HUD.** Attack | Safe | Aim as one
  `.gs-seg` (was three wrapping buttons); an assetless CSS sparkle `burst()` on made-cut + holed/birdie
  (reduced-motion aware); a `holePips()` rail in the top bar (one pip per hole, coloured by score,
  current ringed).
- **Daily Challenge + install nudge.** A title button starts a run on a date-derived string seed
  (`daily-YYYY-MM-DD`, reuses string-seed support — no new param); `beforeinstallprompt` is captured and
  offered as an in-app "Install app" button (dismiss persists in `gs_installNudge`).
- **Mobile hygiene (`index.html` CSS).** `viewport-fit=cover` + `env(safe-area-inset-*)` (mirrored into
  the `.gs-shot` height math) clear the notch/home-indicator; `touch-action:manipulation` +
  `user-select:none` on controls kill tap-delay/double-tap-zoom/stray selection; responsive putt meter +
  replay canvas + `overflow-x:hidden` stop any horizontal scroll. Canvas/audio/haptic feel is eyes-on;
  DEFERRED from the review: a landscape/tablet layout, first-run coaching coachmarks, a putt drag-back
  gesture, and surfacing per-club/character personality in the UI (see `reports/mobile-ux-review-*`).

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
- **Putt from the fringe/apron (GS-fringe-putt).** Being just off the green on the apron (a `fairway`
  lie wrapping the green) used to force a full-swing chip from a few yards — a huge spray cone + a
  fiddly feathered pull (the "weird shot pull" complaint). Now `canPuttFringe(state)` (play.ts: a
  non-penalty `fairway`/`rough` lie within `FRINGE_PUTT_RANGE` 14yd of the pin) lets you take the
  flat-stick with the pace meter, and it's the DEFAULT there (`selPutt` UI flag, a one-tap ⛳/🏌 toggle
  to chip instead). `takePutt`'s guard is relaxed to accept a fringe lie (it still sets the rest lie to
  `green`). CRITICAL: interactive-ONLY — the auto sim only ever putts on `green` (and the auto-finish
  path gates on `awaitingPutt`, green-only), so auto≡interactive is byte-for-byte untouched; no new
  `_gs*` flag (`selPutt` is module UI state like `selClubId`). Tests: `tests/fringe-putt`.
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
- **Surfaces BLEND into a cohesive environment, they aren't stickers on a slab (GS-blend, `style.ts`).**
  The complaint: tees/greens/fairways "just on/next to each other", and rivers that don't read as rivers
  with lakes that don't blend into them. Four coupled fixes, all pure render, all off the art `rng`/`crng`
  (no sim touch, byte-stable): (1) **`offsetPoly(poly, d)`** — a true uniform polygon inset (`d>0`)/outset
  (`d<0`) by mitring each vertex along its edge-normal bisector. Unlike the old `scalePoly`-toward-centroid
  (which crushes a long thin band into a centred sliver) it HUGS the shape, so a river band gets
  channel-following depth rings and a fringe is even-width on a kidney green or long fairway. (2) **First-cut
  fringes** — fairway/green/tee are drawn nested in a soft outset ring blended halfway toward this world's
  rough (`mixHex(base, rough.base, ~0.5)`), and the turf ink edges are softened to translucent (`hexAlpha`)
  mowing lines, so the cut grass EASES into the land instead of a hard cut-out outline. (3) **Grouped liquid
  FAMILIES** — `styleLiquidFamily(polys, palette, rng)` draws ALL the water (water/frozenpond/creek), then
  ALL the lava (lava/lavariver), in shared layered passes: every shore/crust UNDER every body, then bodies
  (overlaps MERGE into one surface — no seam), then `offsetPoly` depth rings + detail. An elongated body
  (long chord ≫ ⟂ width via `longAxis`/`extentAlong`) gets lengthwise FLOW streaks so a river reads as
  flowing current/molten lava; a roundish lake keeps glints. NO per-body ink outline (it would redraw a
  seam through an overlap) — the shore IS the edge. This is what makes a lake and a crossing river of the
  same liquid read as ONE connected body (the "lake and river don't blend" fix). (4) **The landmass is a
  ROUNDED, gently-irregular island hull** (`roundedHull`, off its own `hrng`), not a hard rectangle frame,
  so a stop reads as ground floating in space. CRITICAL invariants kept: `#3f8c3f`/`#5fd45a` turf bases
  still emitted (the holeView fill test), the constellation prim-COUNT invariants (the blend prims are
  theme-independent), and determinism (all extra randomness is the existing art streams). The grouped-pass
  reorder shifts the art `rng` stream slightly → mote/bird/flow positions move (visual only, deterministic).
  `tests/render-blend.test.ts` guards `offsetPoly` (shrink/grow + river-hugging) and that a lava river /
  water creek render through the family drawer. Re-shoot the gallery (`node scripts/gallery.mjs`) after any
  `style.ts` change.
- **SAND is also a grouped family + hazard draw order + archetype scatter recolour (GS-blend-2, `style.ts`).**
  Four cohesion fixes: (1) `styleSandFamily(polys, art, scale)` draws ALL sand (bunker/waste/craters) the
  same GROUPED way as the liquids — shadows under every body, then bodies (overlaps merge), then per-body
  rake, NO per-body ink — so overlapping bunkers read as one excavated body instead of seamed stickers.
  (2) The hazard pass order is layered: SAND first, then exotic scatter, then the penalty LIQUIDS ON TOP
  (so a river through a sandy waste band shows as WATER, not buried under sand), then trees last. (3)
  `scatterLook(kind, arch)` recolours faceted crystal/ice per archetype — on INFERNO it's molten obsidian,
  not a cyan ice patch (the "ice on lava zones" bug; `styleScatter` now takes `arch`, threaded at both the
  feature + hazard call sites). (4) Static `windStreaks` are denser/brighter so the weather READS on the
  decision map BEFORE the shot (it used to be so faint pre-shot that wind only seemed to appear in the
  animated flight). CRITICAL: sand/scatter consume NO rng and wind is the last `crng` consumer, so the
  main terrain rng stream + the liquid/tree draws are byte-for-byte unchanged (determinism + the full
  suite hold). Re-shoot the gallery after touching it.
- **Per-ZONE turf palettes + signature visuals (GS-19, `palette.ts`/`style.ts`).** The old per-theme
  look only HUE-ROTATED the green turf — barely readable ("green fairways in no way match the themes").
  Now each of the 5 archetypes has an EXPLICIT designed turf palette (`ARCHETYPE_TURF`): desert firm
  tan, frost frosted teal/mint, inferno scorched ash-olive, void cosmic indigo, **verdant = the
  original `SHADES` values byte-for-byte** (so a themeless / verdant render is unchanged and the
  render tests still see `#3f8c3f`/`#5fd45a`). `buildScene` resolves the archetype from the theme id
  (else the biome id, via `archetypeFor`) and rarity-deepens it (`worldLook`); the stylers now take a
  resolved `Shade` instead of computing from a hue tint. Signature surfaces: lava (the `LAVA_LIQ` palette
  fed to the GS-blend `styleLiquidFamily` — charred crust shore → glowing body → hot core + flow streaks,
  the SAME drawer as water so flanking lakes AND crossing rivers read as one connected magma) and
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
- **Map navigation — overview / zoom / pan (GS-mapnav).** The follow-cam frames only the contemplated
  shot, so on a long hole the green sits off-screen and "you have no idea what the full hole looks like".
  Three controls floating ON the map (a `.gs-mapctrl` overlay, top-right — NO scrolling to reach them)
  fix that: a **🗺/🎯 overview toggle** (`mapView 'follow'|'whole'` — `whole` drops `focus` so the
  projector fits the ENTIRE hole, green + OB + all hazards in frame), **＋/− zoom** (`mapZoom`, divides
  `viewRadius`; disabled in `whole`), and a **⌖ recenter** (shown only when moved). PAN: the projector
  `focus` is offset by a course-space `mapPan`, and in `follow` mode a map DRAG pans (drag-the-world-
  under-the-finger via a projector frozen at gesture start). GESTURE DISAMBIGUATION (UPDATED GS-mux —
  supersedes the old "drag pans, tap does nothing" model): the gesture is keyed by POINTER COUNT +
  MOVEMENT, not a mode toggle. ONE finger still (< `TAP_SLOP` 8px) → **TAP-AIM** at that point (the
  discoverable default — tap the green to aim there, sets `selFreeTarget`); ONE finger moved → **PAN**;
  TWO fingers → **PINCH-zoom** (`mapZoom`, alongside the `＋/−` buttons). `wireMapAiming` tracks a
  `Map<pointerId,pos>`; a second finger cancels any pending tap/pan, and the lingering finger after a
  pinch can't register a stray tap. The ✋ button is now the "Aim" segment of the one-row SEGMENTED aim
  control (Attack | Safe | Aim) and seeds the free target at the pin; tapping the map is the primary way
  in. CRITICAL: the decision render AND `wireMapAiming`'s unproject both build the projector from ONE
  shared helper `decisionView(play, spray)`, so tap/drag aiming can't drift from what's drawn (the
  projector-sync gotcha). `mapView/mapZoom/mapPan` are module UI state (like `selClubId`), reset by
  `resetMapView()` on every new shot AND new hole — NOT save/reducer state, NOT a `_gs*` flag (so no
  test-hub sync needed). Single-pointer paths verified eyes-on; pinch needs multi-touch confirmation.
- **The play screen NEVER scrolls (GS-mapnav).** `.gs-shot` is a FIXED-height flex column
  (`height: calc(100dvh − 46px)` + `overflow:hidden`, not the old `min-height`), and `.gs-bigmap` is
  `flex:1 1 0; min-height:0` so the MAP absorbs all the slack — the topbar and the club/aim/Hit
  controls always sit on screen without scrolling down to reach them (the "adjust aim, then scroll to
  hit the ball" complaint). `.gs-bigmap` is `position:relative` to anchor the nav overlay.
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
- **Shot POWER + the pull-to-power gesture (GS-power).** Distance is now POWER-dependent: a shot's
  intended carry is `clubDist(club) × carryMult × power`, where `power` is a fraction of the club's
  full carry — 1 a full swing, down to a soft tap, and (with Overdrive) PAST 100%. It's a SINGLE pure
  scalar threaded `ShotInput.power → resolveShot` (multiplies `intended`), `ExecOpts.power →
  executeShot` (also scales the wind-comp carry), `shotSpread(opts.power)` (the preview cone), and
  `ShotDecision.power → takeShot/previewShot` and the `shot` reducer action. CRITICAL determinism:
  power adds NO rng draws and the angular spread (`prof.lateralFrac`) is keyed off the club's NOMINAL
  carry, NOT `intended` — so the *angle* is power-independent and the cone scales in YARDS with power
  (a soft shot's cone is small, a full swing's is the full cone — "draw on the power to expand the
  cone"). Default `power = 1` everywhere, and the AUTO sim ALWAYS plays full swings (never sets power),
  so `playHole`/`simulateRun` and every existing test are byte-for-byte unchanged — the whole 435-test
  suite stays green, and a windless half-power shot lands EXACTLY half as far per-sample (same rng,
  everything scales linearly). Power is INTERACTIVE-only: the player dials it with the gesture below.
  **Overdrive** (`loadout.overpower`, a stackable epic shop perk, +0.1 ceiling/copy to 1.2; helper
  `maxPowerOf(loadout)`) raises the UI's power ceiling past 100% for overpowered shots — the sim
  accepts any power, the loadout just sets the clamp. Rebuilt from perks on resume (no save bump).
- **The unified pull-to-power shot gesture (`wireShotGesture`, app.ts) — aim+power as ONE action.**
  Replaced the old aim-then-pull-the-button flow (the segmented Attack/Safe/✋ control + the swing-pad
  over the Hit button + drag-to-pan, all REMOVED). On the decision map: press anywhere, drag DOWN to
  charge POWER (the spray cone grows live via `previewShot(power: selPower)`), slide sideways to AIM
  (nudges `selAimBearing` by `AIM_SENS` deg/px; `selFreeTarget` is a point along that bearing — only
  the BEARING feeds the sim now, distance comes from club×power, so no unproject is needed), then
  release to FIRE. `selPower` starts at 0 on press, so releasing with power < `COMMIT` (a plain TAP,
  or a charge pulled back up) CANCELS — a stray touch never fires, and "slide back to reset" works.
  Two fingers PINCH-zoom (kept); overview toggle + ＋/− zoom buttons kept. The map framing uses a
  STABLE full-power spread (`frameSpray`, `power: 1`) so the camera holds steady while the cone
  grows/shrinks within it (no zoom-while-charging). A `.gs-power` HUD shows the live %/aim. The Hit
  button is GONE (GS-fullmap) — the pull IS the trigger (a mouse drag covers desktop). Pure feel — the
  sim is untouched (the gesture only chooses club+target+power), so determinism + all sim tests are
  unaffected; verified eyes-on (Playwright: a tap doesn't fire, slide-back cancels, a full pull fires,
  the 40%-charge cone is carry 53–116 vs the full 132–290). The `swingGesture` setting is GONE (the
  pull is the core input now). NB: no new `_gs*` flag or `?param` — gesture tunables (`PULL_RANGE`/
  `AIM_SENS`/`COMMIT`) are plain consts and Overdrive/power are loadout/decision fields — so the
  test-hub guard needs no new control (the new perk appears in the Sim Lab automatically).
  - **Pinch-zoom must NOT trip the pull-to-shot (GS-mapnav fix).** The first finger no longer charges
    on touch — it starts PENDING and only ENGAGES a charge once it drags past `ENGAGE_SLOP` (6px). That
    window lets a quickly-following SECOND finger be recognised as a `pinch` first (a second pointerdown
    sets `pinch` + clears `pending`), so two-finger zoom — the natural zoom gesture — never fires a shot
    or flickers the cone. GOTCHA: the stale-pointer clear that drops a dead gesture's leftover pointers
    keys off `active`/`pinch`; a PENDING finger looks idle, so it's only cleared once OLDER than
    `STALE_MS` (700ms, via `gestureStart = performance.now()`) — otherwise the clear would drop the first
    finger and misread a genuine pinch's second finger as a fresh single-finger charge (never reaching
    `size===2`). Verified eyes-on (Playwright synthetic multi-touch: a single-finger pull fires; a
    two-finger pinch zooms — `mapZoom` changes — without charging or firing). Still pure feel, no hook.
- **The play screen is a FULL-BLEED immersive map (GS-fullmap) — the hole IS the screen.** The old
  fixed column (top stat bar + map + bottom control row) is gone; the map fills the whole viewport
  (`.gs-shot--full` + `.gs-main--bleed` drops the page frame's padding) and every control/readout
  FLOATS on it as a translucent `.gs-glass` overlay: a top-left info chip (`mapTopInfo` — hole/par/
  distance/score + a thin lie·wind line + the momentum pips; the verbose biome/conditions string was
  cut, only an armed lost-rough warning survives), the top-right map-nav column, and a bottom control
  panel (club ◄►, the power HUD, the condensed spray odds, Sam's read). The big Hit button + the
  Attack/Safe/Aim segmented row are REMOVED; the only shot input is the pull gesture, plus a small
  round `»` auto-finish button. CRITICAL pass-through: the overlays are `pointer-events:none` so a
  power pull can START anywhere on the map — even under a readout — and only real buttons (and the
  putt-meter canvas) capture taps; the framed caddy badge is explicitly kept pass-through. The ball
  bias eased to `DMAP_BIAS 0.72` so it reads ABOVE the bottom panel, not behind it. Applies to the
  decision, watching, and putting screens (the hole-complete card stays a normal centred layout).
- **The hired caddy is shown FRAMED on the decision screen (GS-fullmap), and on the putting screen for a
  putting caddy (GS-caddy-display).** A gold-bordered glass badge (`caddyBadgeHTML` → `.gs-caddybadge`)
  draws the caddy's figure (the same `drawCaddy` the play view uses) with its name, so the caddy stands
  out the whole hole. Drawn one-shot per render via a generic pass over every `canvas.gs-caddycv[data-caddy]`
  (the idle bob updates live while charging, so no rAF to leak); each badge carries its caddy id in
  `data-caddy`, so the decision and putting screens share the one draw loop. Absent when there's no
  relevant caddy (decision: no caddy hired; putting: no putting specialist). Verified eyes-on. GOTCHA:
  `.gs-hud-bottom` is `align-items: flex-end` (NOT `stretch`) so the badge + round `»` button sit at
  their NATURAL height, bottom-aligned to the controls column — `stretch` ballooned the gold frame to
  the controls' height, leaving a tall empty band above the figure ("caddy frame too tall for the
  graphic"). The top info chip + bottom control panel are also kept tight (small padding/gaps) so they
  occlude as little of the shot-range cone behind them as possible.

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
