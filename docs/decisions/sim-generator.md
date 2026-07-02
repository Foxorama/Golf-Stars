# Archived engineering log — sim generator

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

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
  - **Cetus = clifftop star-ocean (`cetus-deep.lostRough: 'cetusdeep'`, GS-cetus).** The Whale
    constellation's world: clifftop fairway plateaus floating over a vast star-ocean. Mechanically it
    REUSES the void's island/abyss machinery byte-for-byte — it just sets `lostRough` on its biome row
    (a `cetusdeep` lie → a `cetuslost` +1 drop-back penalty, the same NON-replay drop-back as
    `voidlost`), so it inherits `LOST_ROUGH_MIN_WILDNESS` (0.55) gating + the `VOID_ISLAND_SCALE`
    widening + the straight-island template for free (the lostRough path is archetype-AGNOSTIC; there
    is NO hardcoded `void` in the sim). Calm stops play as ordinary clifftop rough; deep stops lose a
    missed plateau to the deep. Distinct visual identity, NOT a recolour. The signature SHOW is pure
    RENDER decor in `buildScene`, gated to `arch === 'cetus'` and drawn from a dedicated `org` rng
    stream (`mulberry32(hashHole ^ 0x000ce705)`) so it NEVER perturbs the terrain (`rng`) / celestial
    (`crng`) / hull (`hrng`) streams — every other world is byte-for-byte unchanged: a glowing
    **star-river** ribbon threads the rough beside the fairway (`cetusRiver`, an offset of the
    centreline, clipped to the plateau) and pours off the tee-side cliff as a directional
    **star-waterfall** (a curtain spilling BEYOND the island, unclipped), over a deep **star-ocean**
    where recognizable side-on **space-whale silhouettes** surface (`cetusOcean`/`whaleSilhouette`,
    placed clear of the island, drawn BEFORE the landmass so the cliff overlaps their near edges).
    Both renderers get it (shared scene builder). Re-shoot the gallery after any `cetusRiver`/
    `cetusOcean`/`whaleSilhouette` change; the abyss balance is covered generically by
    `tests/worlds` + `tests/themes` (Cetus is in their world/theme lists) and `tests/cetus` locks the
    render gating + determinism + the lie/penalty wiring. NOTE: the whole-hole map is the cramped
    worst case for ocean visibility (the land hull hugs the geometry); the zoomed play view shows more
    sea. NO new `_gs*`/URL hook (content-as-data + an archetype-derived render), so the test-hub guard
    needs nothing.
    - **GS-cetus-2 reworked all of the above — the original star-river was bugged + ugly + read as a
      flat-fish whale.** Four coupled fixes (all still pure render gated to `arch === 'cetus'`):
      (1) **The "river jumps with zoom/pan" bug.** `cetusRiver` + `cetusOcean` shared ONE `org` rng
      stream, and `cetusOcean` rejected whale samples against the *projected* island polygon — whose
      draw COUNT differs at every zoom/pan — so the river's side+wobble re-rolled every frame. Fixed by
      giving the ocean and river DISTINCT seeds (`oceanRng` `^0x000ce705`, `riverRng` `^0x00cef10e`) AND
      placing whales in COURSE space (rejected against the course-space hull, projector-independent
      count). LESSON: never let one rng stream's draw count depend on the projector, and never share a
      stream between two decor functions if either's draw count can vary.
      (2) **The river is now CARVED, not a straight bar beside the fairway.** `cetusRiverPath(hole, rng)`
      is a PURE, projector-independent meander that snakes down the hole and weaves across the corridor
      (sized off the HOLE LENGTH, not the giant lostRough island half-width; swing capped within the
      corridor). `cetusRiver` projects it to a glowing star-river (dark deep-water bed + glowing surface
      + luminous banks + bright current spine + drifting stars), gated to par ≥ 4 (a par-3 island has no
      corridor). GOTCHA (cost a long hunt): the SVG serializer emits a nested `<clipPath>` INSIDE the
      clipped `<g>`, which silently DROPS the group's contents — clipping the styled river to the island
      hid it entirely (the unclipped magenta debug showed it fine). The river needs no clip (meander is
      corridor-capped), so it's drawn unclipped. Do NOT nest a `clip` prim inside another `clip` prim's
      children.
      (3) **Whales are proper SPACE WHALES** (`whaleSilhouette`): a chunky lit-from-above body + belly
      shadow, a long humpback pectoral fin, a two-lobed notched fluke, a blowhole mist spout, a glowing
      eye, bioluminescent star-speckles. Placed in COURSE space (drift with the camera), sized in screen
      px (clamped 58–214) so they read at both the whole-hole map and the zoomed play view. A denser
      star-ocean base makes the deep read as the intro's starfield.
      (4) **Island-green PAR 3s** (the headline): a `lostRough && par === 3` hole has NO corridor — the
      fairway feature is a compact organic island around the green (`generate.ts`, ≈110 yd wide at a
      ~165 yd hole, `fairwayHalfWidth` = island radius, flanking penalty hazards skipped). The RENDER
      detects it off the `roughLie` biomeMod (no new hole flag) and draws a separate land PLATFORM per
      play feature (green island + tee) instead of one hull spanning tee→green, so the open star-ocean
      (with whales) reads between them. Generous enough that the auto reach-AI clears the no-death-spiral
      bars (full suite green); re-run `tests/worlds`+`tests/themes`+`tests/cetus` after any island-size
      or river change. `tests/cetus` asserts the river colour `rgba(70,180,225,0.85)` (its glowing
      water) — update it if you re-tone the river.
    - **GS-cetus-3 made it read SIDE-ON — a clifftop diorama, not a flat top-down map.** The ask: the
      river "started out of nowhere", didn't read as a river/waterfall, and the world had no depth. The
      lever is DELIBERATELY the render, NOT the shared projector — a real camera pitch would foreshorten
      the play field and force an aim-unproject/spray-cone/follow-cam rewrite across `app.ts` (and break
      the "shot readability is sacred" rule). Instead a pure, `arch === 'cetus'`-gated 2.5D treatment
      sells the side-on clifftop while the top-down play/aim projection stays byte-for-byte untouched:
      (1) **Dropdown cliff faces** (`cetusCliffs`, `style.ts`, own `cliffRng` `^0x00c11ff5`): each
      projected plateau's FRONT (max-screen-y) silhouette — extracted via a `convexHull`+`frontEdge`
      of the land hull — is extruded DOWNWARD into a lit rock wall (bright clifftop strata fading to
      abyss, contact-shadow under the lip, vertical fault cracks + star-dust, a cast shadow into the sea,
      a luminous lip). Height keys off plateau width so it scales across the map/follow-cam. Rarity
      `deepen` only darkens the LOWER strata (`dk` ramp) so the lit top always pops. Face detail lives in
      ONE `clip` (never nest a clip in a clip — the SVG-serializer drop bug). Drawn AFTER the land fill
      (plateau caps the cliff) and BEFORE the river. (2) **The river now has a SOURCE + a real spill**
      (`cetusRiver` reworked): a glowing spring wells up at the upstream (green-side) mouth so it no
      longer fades in from nowhere; the channel is DENSELY packed with the intro's starscape (≈10% hero
      stars w/ haloes) so it reads as a *river of stars*; and the waterfall pours over the actual
      extruded front cliff FACE (the `faces` geometry `cetusCliffs` returns → the fall drops the exact
      face height into the ocean), as a fanning star-curtain + watery veil + splash-pool ripples.
      Determinism-safe: three DISTINCT cetus streams (ocean/river/cliff), all gated, so every other world
      is byte-identical and `tests/cetus` (still asserting `rgba(70,180,225,0.85)` — kept as the river
      surface stroke) stays green. Re-shoot the gallery after any `cetusCliffs`/`cetusRiver` change. NB
      the whole-hole map is the cramped worst case; the zoomed decision/follow-cam view shows the cliff
      dropping behind the ball with the fairway readable ahead. NO new `_gs*`/URL hook, so the test-hub
      guard needs nothing.
    - **GS-cetus-4 tamed the river on par 4/5 (+ fixed the side-chip "bonus waterfall").** Player
      feedback: par 3s read great, but on par 4/5 the full-length meander + its 3.4×-width bank glow
      buried most of the mown fairway, the waterfall poured from mid-turf at the TEE straight down over
      the ground (worst on calm stops, where there's no abyss below it), and chipping onto the green
      from the side conjured a second waterfall over the green. Three coupled fixes:
      (1) **The river is ONE diagonal crossing now** (`cetusRiverPath` rewritten): a spring in the rough
      near the corridor, a single meandering pass over the fairway at `uc ∈ [0.38, 0.6]` of the hole,
      then out through the rough along a tee-ward-leaning axis (tangent rotated 102–124°) to the land
      platform's edge — found by marching the analytic meander against `landPolysCourseFor(hole)` with
      fixed step counts + a bisection refine, ALL rng drawn up front, so the path is byte-stable and
      camera-proof. Narrower (`rw ≤ 8`yd), gentler swing (`amp ≤ 9`yd), tapered at the spring. Most of
      the corridor is clean turf again; the crossing reads like a creek, not a canal.
      (2) **The spill end is FIXED in course space** — the polyline is ordered SOURCE → SPILL. The old
      code picked "whichever river mouth sits lowest on screen" per frame; under the follow-cam's
      `up: ball→pin` rotation a side chip flipped the spill to the green-side mouth and painted the fall
      there. The fall itself (still screen-down, the cliff extrusion's convention) is PAINT-GATED: it
      draws only when `spillAtEdge` (the river actually reached the platform edge, course space) AND two
      probe points below the lip `unproject` to open deep, never turf — rng for the streaks is consumed
      UNCONDITIONALLY so the camera can only choose what's pushed, never what's drawn. Restyled: a
      tapered veil fading in stacked bands, staggered dimming streaks, mist + ripple rings at the foot.
      (3) **River star sizes clamp to the projected channel width** (paint-size only, never the count):
      at whole-map zoom the narrow creek is a few px wide and full-size stars + halos read as a solid
      white chalk squiggle. `tests/cetus` still asserts the `rgba(70,180,225,0.85)` surface stroke.
      Same pass, the **void par-4/5 slab** got its identity back (GS-cetus-void-45): `glowRings` now
      uses uniform `offsetPoly` outsets (a centroid scale ballooned a long corridor's halo lengthwise
      past the tee/green — the "sausage blob"), fairways get a luminous rim stroke on the void only
      (the par-3 islands' lit-platform read), and the void fairway palette's stripe light↔dark spread
      widened (`#6a60ba`/`#241e4a`) so mowing bands survive the indigo-on-indigo value crush.
      And a latent serializer bug found via the gallery: `scenePrimsToSvg` ids (`gsc0`/`gsg0`…) were
      counter-per-render, but SVG ids are DOCUMENT-global — two hole SVGs in one document (gallery,
      test hub) made `url(#gsc0)` resolve to the FIRST panel's clip/gradient, silently clipping the
      second panel's stripes away and bleeding its glow colours. `scenePrimsToSvg(prims, idPrefix)` +
      `holeIdPrefix(hole)` (a hole-hash prefix) keeps renders byte-stable per hole while co-mounted
      holes get disjoint ids. If you ever eyeball a multi-hole sheet and the turf looks flat, check the
      ids FIRST — this one masqueraded as a palette problem.
    - **GS-cetus-5 turned Void & Cetus into ISLAND-HOP clifftop worlds — human interest first, balance
      later.** The deep (lost-rough) par 4/5 were the only dull holes left: forced dead-STRAIGHT (the old
      rule kept a lost corridor straight so the auto-AI's straight aim couldn't wander off the island into
      the void). Player call: for these two biomes, **ignore the death-spiral balance for now** and make
      them the most visually interesting worlds; rebalance the AI afterward. So a lost-rough par 4/5 is now
      a bending CHAIN of clifftop/asteroid PADS separated by VOID carries:
      (1) `chooseTemplate` lets a lost par 4/5 fall through to the full shape grammar (dogleg/cape/S/
      hairpin); only the par-3 island stays a straight single-target carry. `buildCentreline` honours the
      shape for lost par 4/5 and bends them 1.4× HARDER (`island` multiplier) — still capped at 0.44·len so
      no self-cross. (2) The corridor is BROKEN into pads: an `if (lostRough && par>=4)` block appends
      island-hop gap bands (par-4: 2–3 pads, par-5: 3–4), evenly spread with jitter, a touch wider than a
      fair-rough break — genuine void carries. Reuses `brokenCorridor` (already multi-segment) → each pad
      becomes its own fairway feature → `lostPlatformsCourse` already maps each to a platform → the render
      extrudes each into a 3D block, so the par 4/5 finally gets the par-3's side-on diorama for FREE.
      All new draws are gated to lost-rough, so every other world (and calm cetus/void stops) is
      byte-identical; `GENERATOR_VERSION` bumped 10→11. **Why the structural validators stay green:** on a
      lost hole the void off the fairway is the implicit `roughLie` LIE, not a hazard polygon — so
      `validateFairness` (hazard polys only) and `validateCrossings` (lava/creek/etc. only) impose ZERO
      constraint on a lost corridor's shape. Bending + breaking it can't crash generation. **The waived
      part is balance:** the void gaps DO cross the centreline, so the carry-aware AI treats them as forced
      carries (it lays up / carries), which is why `tests/biomes` death-spiral still passes even at
      wildness 1 — but a low-skill golfer tips over the relaxed bar. So `BALANCE_EXEMPT_BIOMES`
      (`biomes.ts` = {void-garden, cetus-deep}) skips these two in the death-spiral harnesses
      (`tests/characters`, `tests/biomes`, `tests/scorch`) and `tests/zones` drops the void toPar bar
      (keeping "the void genuinely bites" + "every hole terminates"). Structural fairness is NOT relaxed.
      TODO(GS-cetus-6): teach the AI to hop the chain (aim pad-to-pad, not straight at the pin), then
      restore the bars + remove the exemption. RENDER: `platformCliffs` (renamed from `cetusCliffs`) takes
      a `CliffLook` palette — cetus = blue clifftop (`CETUS_CLIFF`), void = violet ASTEROID underside
      (`VOID_CLIFF`, applied to void's lost pads only, gated so a calm void rectangle isn't given an odd
      underside). Fairway mowing stripes were softened (`mowTones` blends the light/dark bands halfway to
      the base — the "Beetlejuice snake" fix; indigo worlds keep a touch more via `MOW_BLEND`). Re-shoot
      the gallery after any `platformCliffs`/`mowTones`/island-hop change.
    - **GS-cetus-6 gave the CALM cetus/void stops a two-tier raised fairway SHELF.** A calm stop's whole
      play-bounds is playable ROUGH (it can't be islands), so its corridor read flat. The projection is
      top-down (shot-readability sacred → no camera pitch), where only DOWN-facing surfaces are visible —
      so a long near-vertical corridor can't show a cliff along its sides (a pure downward drop is
      invisible in the zoomed play view). `raisedShelf` (render-only, no rng, gated to calm cetus/void via
      `calmShelf`) implies the lift the top-down way: an OUTSET rock PEDESTAL (`offsetPoly` grow) shifted
      DOWN by a scaled lift, drawn UNDER the fairway/green fill, so a band of rock rings the surface —
      present on the near-vertical EDGES (what makes it read at follow-cam zoom) and thicker/darker along
      the down-screen edge — plus a soft cast shadow on the rough and a lit rim (cyan cetus / violet void)
      on top. Reads as a raised causeway/mesa at both the whole-hole map and the zoom, using the pads'
      `CliffLook` palette. Deep stops already sit on real extruded platforms, so the shelf is
      `!lostHole`-gated.
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


## GS-variety-2 — holes stop feeling identical (variety decoupled from difficulty)
The complaint: "fairways and greens are almost always exactly the same, same line grading, same curve
— the only difference is the colour", hazards bunch at driver range then go quiet until the green, and
doglegs are cuttable. Root cause: nearly all the variety machinery (capes, hairpins, blocking groves,
big bends) was WILDNESS-GATED, so the calm early stops — where a run spends most of its time — were all
gentle straights with sparse hazards. The fix decouples VARIETY from DIFFICULTY (the user's explicit
steer: "be incredibly lax with the creation + difficulty rules; focus on fun/variety, tune difficulty
per-hole later"). `GENERATOR_VERSION` bumped 9 → 10 (stream reordered — no byte-for-byte claim here).
- **Shape variety at any wildness (`chooseTemplate`).** Cape/hairpin/double now carry a nonzero BASE
  probability (biome-biased) instead of a `wildness ≥ 0.3/0.5` gate — a calm opener already draws the
  full vocabulary. Wildness still turns the dial up a touch; the real difficulty ramp is bend SEVERITY.
- **Proper doglegs (`buildCentreline`).** `dogFac` floor raised `0.35 → 0.5` (`0.5 + 0.5·wildness`), cap
  `0.4 → 0.44·length`, so a calm dogleg genuinely bends instead of drifting.
- **Filled corners (blocking groves).** The `wildness ≥ 0.3` gate is GONE — a dogleg's inside corner is
  planted with a tree clump (a stand + `rng.int(1,3)` companions) whether the stop is calm or wild, so
  you can never just bomb it straight across the gap. Still non-penalty + OUTSIDE the corridor
  (`validateFairness` ignores them; the fairway route stays clean). Density/canopy were tuned DOWN from
  a first over-aggressive pass that spiked the auto reach-AI (which fires at the green through the
  corner) past the balance bars.
- **Broken fairways (`brokenCorridor`, biome `roughBreaks`).** The corridor is carved into 2–3 mown
  ribbons by bands of native ROUGH across the mid-hole ("a couple of small fairways broken by rough").
  Rough is the default off-feature lie (a fair carry/thread, never a lost card), so it needs no fairness
  exemption; each retained run ≥3 points becomes its own `fairway` feature (the FIRST anchors
  `fairwayHalfWidthOf`). SKIPPED on lost-rough worlds (void/cetus) — a gap there reads as the abyss
  PENALTY, not fair rough.
- **Greenside penalty RINGS + APPROACH LAKES.** The mid/green zone that went quiet after driver range
  now bites: a `sanctioned:true` greenside ring (lava/water/void hugging the green's NON-approach arc)
  and a big flanking lake ~3/4 up. A ring is EXEMPT from `validateFairness` (it deliberately hugs the
  green) but proven fair by the new `validateGreenApproach` — the flag + green centre stay penalty-free
  and a penalty-free landing exists just short of the green, because the ring is kept off the approach
  WINDOW (angular, ±~69°) AND the approach LANE (`segDist` to the incoming line). A hole gets a
  forced-carry CROSSING **or** greenside drama, NEVER both (`noCrossing` gate) — stacking a ring + lake
  on top of an ember/frost river piled the auto-AI's mean past the balance bar. So ember par-3s (no
  river) get the lava ring; par-4/5s keep the river.
- **Per-world fairway PATTERN (`fairwayStripes`, render).** Each archetype grooms its turf a different
  way — horizontal mowing (parkland/ocean/void/cetus), a vertical swept grain (frost), a faceted/wind
  diagonal (crystal/tempest/desert), a lush cross-mown checker (fungal) — so fairways read distinct
  beyond their colour. Rides the main corridor's band grid so apron + broken segments line up. Both
  renderers share it (buildScene), so `render-match` holds; re-shoot the gallery after any change.
- **Difficulty bars relaxed on purpose.** The richer hazards + bigger bends nudge the auto reach-AI's
  max-wildness mean up (`characters.test` toPar bar 1.15 → 1.3; ember/frost stay < 1.0). The STRICT
  blow-up (≥+5) guard (< 5%) is untouched — that's the real death-spiral signal. `shapes.test` +
  `layout-variety.test` were rewritten from "X is wildness-gated" to "X appears on calm stops too".
