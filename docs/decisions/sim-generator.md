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
- **DEEP ROUGH chokes the dogleg cut-line (GS-deep-rough).** Groves alone weren't enough — a lofted
  bomb clears a treeline, so firing straight over a dogleg corner at the pin still paid off and the
  "play down the fairway" strategy had no teeth. Deep rough is the GROUND answer, sitting in the same
  place as the groves (walk the STRAIGHT tee→green chord; where it's genuinely OFF the corridor — the
  corner being cut — drop a themed blob + a couple of companions to choke the gap). On land worlds it's
  the new `deeprough` lie (carry 0.5, dispersion 1.7, roll 0.2/firmness 0.14 — the deepest recoverable
  land lie, harsher than `fescue`; NON-penalty, a hack-out you can't advance far from, so cutting the
  corner GAINS NOTHING). On the OCEAN world (`tidal-archipelago`) the deep rough is the SEA itself
  (`deepRough: 'water'`) — the sandy-shore rough gives way to open water, so the cut is a real penalty
  carry; every other world sets `deepRough: 'deeprough'`. Opt-in per biome via the `deepRough` field:
  the lost-rough worlds (void/cetus) DON'T set it (off their fairway is already the abyss → untouched)
  and the `!lostRough` guard double-protects a calm cetus/void stop. **Fair by construction:** the blob
  sits far from the BENT corridor even though it's on the straight chord (placement requires
  `polylineDist(cp, centreline) ≥ fairwayHalfWidth + 22`, radii kept small), so for the ocean's penalty
  water `validateFairness` holds with big headroom — the fairway route around the leg is always clean.
  STRAIGHT holes place nothing (the chord hugs the centreline → the off-corridor reject fires with zero
  rng), so the pass draws NOTHING on a straight hole and is byte-identical there; a dogleg's new draws
  are appended AFTER every other hazard pass (each earlier placement byte-identical). Wildness-gated at
  `DEEP_ROUGH_MIN_WILDNESS = 0.3` (above the stop-0 ceiling → the forgiving opener stays cuttable).
  Balance holds because the auto reach-AI plays down the fairway, not the cut — the corner deep rough
  punishes the PLAYER's greedy line, so the death-spiral bars barely move (full suite + harness green).
  Render is table+dispatch per archetype (`style.ts DEEP_ROUGH` + `styleDeepRough`, own per-patch
  stream like fescue): a dark dense body — tangled grass (verdant/tempest/desert/fungal), a shadowed
  packed snowdrift (frost), a cinder-ash clump (inferno), a shard thicket (crystal) — so the tangle
  suits the world. `GENERATOR_VERSION` 12→13; content-as-data (a biome field + a lie row + a generator
  pass), no new `_gs*`/URL hook, so the test-hub guard needs nothing. Re-shoot
  `scripts/deeprough-preview.mjs` after any `styleDeepRough`/`DEEP_ROUGH` change; guarded by
  `tests/deep-rough.test.ts` (lie ordering, off-corridor placement + fairness, the cut-line is choked,
  the ocean's sea carry, void/cetus untouched, the calm-opener gate, determinism). NOTE: GS-rough-gradient
  (below) later overturned the "deeprough only chokes the far corner, gated off calm" invariant — deep
  rough now ALSO lines every fairway edge at all wildness, so `tests/deep-rough.test.ts`' placement/gate
  assertions were retargeted to "the mown centreline route stays clean" (the cut-line-choked + ocean-sea
  + void-untouched + determinism cases still hold).
- **ROUGH GRADIENT — heavy rough hugs the fairway, trees thicken with distance (GS-rough-gradient).**
  Player report: "it's far too easy to play straight through the rough and ignore the actual golf holes —
  add a lot more trees and heavy rough to ALL difficulties." Off the fairway used to be mostly LIGHT
  `rough` (carry 0.9) with only sparse scattered tree/fescue blobs, so a sprayed ball just bounced through
  it and paid no real price for missing the hole. The fix is a new generator pass that FILLS the
  off-corridor rough with a distance-graded mix: a HEAVY-ROUGH band (`deeprough`/`fescue`) hugging the
  fairway edge (near-continuous, so a miss is caught), and beyond it the world's `trees` thickening the
  further out you go ("the further away, the more forest"). The ONLY difficulty lever is the SHAPE, not
  fairness (every kind is NON-penalty, so `validateFairness` ignores them and they may hug the edge):
  - **Calm stops** — a WIDE, recoverable heavy-rough BUFFER with the trees pushed far out, uniform hole
    to hole. A wild spray lands in deep rough it can hack out of, not the woods — "so a wild spray isn't
    as punishing" on the easy stops (the explicit ask).
  - **Wild stops** (≥ `ROUGH_CHAR_MIN_WILDNESS` 0.45) — a per-hole CHARACTER roll off the side stream:
    a TIGHT tree chute (canopies crowd the edge), a heavy-rough gauntlet (deep rough at the edge), or a
    mixed hole, and the forest also thickens with wildness. So the hard stops read "a lot more random".
  - **World identity via `treeDensity`** — the forest ring count/plant probability scale by the world's
    `treeDensity`, so desert stays scrubby (few trees, still a real heavy-rough band) and jungle/parkland
    wall the fairway. The OCEAN keeps a `fescue`-only band (its heavy rough is a sandy DUNE shore; its
    deep-rough-cut is the SEA), so it never uses the land `deeprough` lie — `heavyKind` keys off
    `biome.deepRough === 'water'`.
  - **A `standoff(r) = r·1.34 + 1`** keeps every blob fully OUTSIDE the LOCAL corridor edge (using the
    per-point `leftHW`/`rightHW` half-widths, not just the global widest), so heavy rough LINES the
    fairway but never sits on the mown centreline route — a sensible shot down the middle is always clean
    (machine-checked in `tests/deep-rough.test.ts` + `tests/hazards2.test.ts`). Small tree canopies
    (r 3.5–6) so a "tight" chute hugs close without poking onto the fairway. `maxLat` caps the deepest
    trees near the old treeline's reach (`edge + 96`) so `playBounds` — and the OB box derived from all
    terrain — doesn't balloon the hole out on the wide heavy-rough holes.
  - **CRITICAL — DEDICATED side stream.** The whole pass draws from `new Rng(`${seed}:rough:${holeIndex}`)`
    (the pin/slope/contour pattern), NOT the main terrain `rng`. So it perturbs ZERO existing draws: every
    penalty crossing/pond, green, grove, the whole terrain GEOMETRY, and `validateCrossings`/
    `validateFairness` stay byte-for-byte identical — only the (non-penalty) rough hazards are ADDED. This
    is why the scattered legacy treeline/fescue passes were KEPT (unchanged, on the main stream): removing
    them would have reflowed the main stream and re-surfaced a latent crossing-clamp edge case
    ("creek crowds the green"). The side stream sidesteps all of that; the legacy scatter just reinforces
    the same forest. `GENERATOR_VERSION` 18→19 (output changed — hazards added — even though geometry
    didn't). The renderer needs NOTHING new: it already dispatches `trees`/`deeprough`/`fescue` per
    archetype, so the gradient renders as that world's flora/tangle automatically.
  - **Balance was DELIBERATELY not re-tuned** (the ask: rough/trees FIRST, "we will then go and rebalance
    afterwards"). The course is meaningfully harder now — max-wildness `toPar/hole` sits ~1.0–1.4 and the
    floor-hit (pick-up) rate roughly doubled to ~10% (≈20% for the sparsest character bags), just over the
    old bars. The death-spiral fences in `tests/{biomes,themes,patches,characters}.test.ts` were relaxed
    to this interim reality with a greppable `TODO(GS-rough-gradient)` on each — they are REGRESSION
    FENCES (catch a WORSE spiral), not the design target. Re-tighten them in the follow-up rebalance (a
    smarter reach-AI that plays back to the fairway / richer starter bags), NEVER by softening the rough.
  - Guarded by the retargeted `tests/deep-rough.test.ts` + `tests/hazards2.test.ts` (heavy rough lines the
    hole but the mown route stays clean; determinism), and the fairness/termination sweep in
    `tests/biomes.test.ts` (byte-identical crossings → no new throws). Re-run `scripts/gallery.mjs` to
    eyeball the denser forests after any tuning of the ring/buffer/reach knobs.
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
- **Fairway width is a per-hole ARCHETYPE grammar, not one recipe (GS-fairway-width,
  `chooseWidthProfile`).** Player report: the GS-terrain profile (full body + landing bulges + one
  soft pinch, every hole) homogenised the game — width never distinguished holes, and "the fun
  factor is completely mitigated by the homogenisation". Real courses vary width DELIBERATELY,
  hole to hole, and that's the model: a per-hole width archetype drawn like the shape grammar —
  **classic** (the old recipe), **chute** (a narrow tree-lined drive that lets out into a generous
  body + approach bulge — Augusta's 18th), **neck** (a full driving body squeezing down for the
  approach into the green — Royal Lytham entrances), **hourglass** (wide either side of a waist
  pinched at the driving zone, so you lay up short or thread it — Oakmont / links driving zones),
  **wander** (a big multi-lobe sine — wide bays alternating narrow straits, links-style), **thin**
  (a uniformly tight 0.6–0.76× ribbon — the rough-lined US-Open strip) and **broad** (a 1.24–1.5×
  meadow — St Annette’s). Stamped on `Hole.widthId` (optional contract field; the sim never branches
  on it — physics ride the corridor geometry) and surfaced as a HUD chip (`widthLabel` in app.ts:
  "Tight drive" / "Tight approach" / "Pinched waist" / …) so a squeeze is readable BEFORE the
  drive. The mechanics: each profile is an `at(u)` width multiplier about `baseHalf`, composed
  under the unchanged END ENVELOPE and lateral asymmetry (asymmetry DAMPED per profile via
  `asymScale` so a squeeze holds); each carries its own `floorFrac` — the squeezed archetypes dip
  well below the old universal 0.5 floor BY DESIGN (neck/hourglass 0.3, chute 0.34), with an
  absolute 5-yd half-width floor so a corridor never degenerates. Like the shape grammar it is
  VARIETY, not difficulty (all archetypes appear at every wildness — machine-checked; the
  `widthScale = 2.0 − 1.25·wildness` early→late lever still carries difficulty and the per-profile
  params are seeded so no two chutes match). Par 3s draw only whole-hole profiles
  (classic/thin/broad/wander — a 13-segment pitch corridor is too short for a chute/neck story);
  lost-rough island holes (void/cetus) are EXEMPT (`widthId 'island'`, the classic full-body
  profile) because width IS survival there — the abyss is the penalty, and a squeezed island is a
  ball-shredder. Everything downstream held for free: `fairwayHalfWidth` still keys off the WIDEST
  point so hazard placement/`validateFairness` stay provably fair (a broad hole pushes hazards
  further out — conservative), and the apron starts at the corridor's own end half-width so a neck
  reads as a narrow entrance opening into the green complex. This is a DELIBERATE stream reflow
  (the profile draws replace the old fixed draws, counts differ per archetype):
  `GENERATOR_VERSION` 16→17, three pinned-seed fixtures re-pinned (ui viewHole 1234→1200, ace
  430→699, and the tents non-penalty test now tolerates a deflected ball trickling into a REAL
  hazard — "off the tent, into the lake" is course physics, not a tent penalty). Balance was
  deliberately NOT re-tuned (the ask: real-golf feel first, AI/balance to follow) — but the full
  suite stayed green anyway: death-spiral bars, fairness/crossing validators across every world ×
  wildness, island-hop completability. Guarded by `tests/fairway-width.test.ts` (all archetypes
  appear, calm-stop decoupling, chute/neck/hourglass geometry actually reads in the corridor
  polys, thin < classic < broad ordering, island exemption, fairness sweep, determinism).
  Re-shoot `scripts/width-preview.mjs` (a per-archetype sheet) after touching the grammar; the
  balance/AI follow-up (teach the auto AI to lay up short of a waist, then re-tighten the bars)
  is the deferred second half.
  - **Follow-up: the lost worlds joined the grammar under an ISLANDS-ONLY-GET-WIDER rule
    (GS-island-width).** GS-fairway-width had exempted void/cetus entirely (flat 'island' classic) —
    but the player wanted the variety THERE too, "expand the fairways to make them a bit wider,
    just don't make them smaller". Three coupled changes, all widen-only: (1) `VOID_ISLAND_SCALE`
    2.4 → 2.6 — the baseline island corridor itself is ~8% wider. (2) A dedicated ISLAND width
    pool in `chooseWidthProfile` for lost par 4/5s — 'island' (baseline), 'island-bays' (1–2 big
    outward landing bays that swell the pads), 'island-flare' (the plateau grows toward the green —
    a receptive approach pad), 'island-broadtee' (a big launch plateau easing home), 'island-broad'
    (the whole plateau 1.12–1.3×). THE RULE, machine-checked (`tests/fairway-width.test.ts` sweeps
    `at(u)` over 300 seeds × a 41-point u-grid): every island profile's multiplier is ≥ 1
    EVERYWHERE — the shared organic movement is a positive-only wave `amp·(0.5+0.5·sin)`, so
    variety comes from bulging OUTWARD, never a squeeze (the old classic recipe's wave/pinch could
    dip to 0.5× — that dip is gone too, so worst-case island width strictly improved on top of the
    raised baseline). `chooseWidthProfile` is exported for that guard. (3) Island-green PAR 3s get
    a seeded widen-only factor (×1–1.25) on the green-island blob — snug target to generous shelf,
    never below the old fixed size; a lost par 3 keeps the plain 'island' widthId (the pool ids
    would lie — the blob replaces the corridor). Determinism: all new/changed draws sit behind the
    `lostRough` arm, so every NORMAL world is byte-identical (no fixture re-pins needed — the full
    suite passed untouched except one); `GENERATOR_VERSION` 17→18. The one test change:
    `tests/island-gaps.test.ts`' crash-guard fuzz asserts raw `generateCourse` throws somewhere in
    its sweep (proving the `generateStopCourse` retry is exercised) — wider pads made raw
    sliver-pad throws genuinely RARER (good), so a v<20 blind fuzz finds none; the known throwing
    configs are now PINNED (re-hunt + re-pin them whenever GENERATOR_VERSION bumps) and the broad
    sweep stays cheap. Void/cetus stay in `BALANCE_EXEMPT_BIOMES`; wider-only can only soften them
    (zones.test's cetus bar + island-hop completability all held). `scripts/width-preview.mjs` now
    hunts the island pool too (void/cetus rows) — re-shoot it after touching the island profiles.
  - **Follow-up: the auto AI now READS the width (GS-fairway-width-2 — the deferred AI/balance half).**
    GS-fairway-width shipped the width GRAMMAR but "the AI played every profile the same" — a positioning
    drive bombed a full club straight at the green regardless of a waist/strait in the landing zone. Now
    the auto reach-AI reads the corridor the generator actually drew and plays POSITION OVER POWER off a
    genuine pinch: `widthLayupTarget` (in `round.ts`, inside the shared `safeTarget`, so auto ≡ interactive
    by construction — contract 2) checks the natural full-drive landing; if it comes down in a genuinely
    TIGHT driving-zone pinch AND a meaningfully wider bay sits within a modest lay-up short of it, it aims
    at the bay instead (a shorter club, tighter cone, held fairway). `corridorHalfWidthAt` MEASURES the
    fairway polygon perpendicular half-width (the tighter of the two sides, via a ray↔edge cast) — it reads
    the drawn ribbon, so it can never drift from the width profile, and returns a wide cap off-fairway (a
    broken-corridor gap never reads as a bay). Pure geometry, ZERO rng — the shot stream is byte-identical
    per shot; only the AI's target/club choice shifts, so no feature flag and no test-hub hook (like the
    flight-profile constants, `WIDTH_LAYUP` is a module const, not a `_gs*` window flag).
    - **Tuning is the whole story — it is NOT a free win.** Laying up trades distance for a cleaner lie,
      which only PAYS when the corridor is tight AND the rough punishing (deep stops). At calm/mid wildness
      the corridor is wide (the `widthScale = 2.0 − 1.25·wildness` early-lever), so a lay-up there LOSES
      strokes. An early, eager config (lay up to any bay 1.35× wider within 60 yd of a `< 18`-yd pinch)
      improved the max-wildness bar but LOWERED mean per-stop Stableford on the common mid-wildness case
      (default bag 10.705 → 10.68) — a contract-4 fail. The fix is the LOW `pinchHalfWidth` (10): a corridor
      that tight only occurs at high wildness (the driving zone shrinks with the ramp), so the lay-up fires
      on the brutal deep stops it helps and stays QUIET on the wide corridors where it would cost. Final
      config (`meanLandFrac 0.88`, `layupYards 34`, `widenFactor 1.35`, `pinchHalfWidth 10`): mean per-stop
      Stableford RISES (default 10.705 → 10.715, characters ~flat — contract 4 satisfied), max-wildness
      `toPar/hole` 0.783 → 0.769 and floor-hit 7.55% → 7.36% on the BIOMES bar. Re-measure both the ship
      gate (mean SF) AND the max-wildness bar if the knobs are ever retuned — the two pull opposite ways.
    - **Fences re-tightened where the gain is real** (the GS-rough-gradient interim relaxations): the
      `biomes.test` floor-hit fence 0.12 → 0.10 (measured 7.36%), and `themes.test`/re-measured to ~0.95 so
      its `toPar` fence returns to the <1.0 target (par+1 was the rough-gradient interim). `patches.test`
      (a small, noisy 12-seed × seeded-biome subset) moved ~flat (the width-AI perturbs it a hair) so its
      fence stays at the conservative par+1.1. The SPARSE-bag CHARACTER fences stay relaxed: a sparse bag
      often has no club to lay up WITH, so width-reading barely moves them (worst `toPar` ~1.27) — closing
      that gap is the broader GS-rough-gradient-rebalance (richer starter bags / a general play-back-to-the-
      fairway reach-AI), never by softening the rough. Guarded by `tests/fairway-width.test.ts`'s
      "width-aware auto AI" block (the measurement tracks a real hourglass pinch; the lay-up is forward,
      never past the green, deterministic, and only ever pulls back to a WIDER bay; wide calm corridors are
      left alone). The remaining AI half — teaching the reach-AI to read the width for CLUB SELECTION in a
      chute/thin ribbon (a tighter cone), and re-tightening the sparse-bag bars — rides GS-fairway-width-2's
      sibling, GS-rough-gradient-rebalance.
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
  - **Follow-up: rivers FLOW from a source to a sink, they don't start/stop in mid-rough (GS-rivers).**
    Player report: "the rivers are all the same shape and just start and stop out of nowhere — they should
    look and flow like real rivers with different sizes/shapes/directions, starting off-map or hidden in
    trees and ending in a lake." Two changes, both keeping the CROSSING geometry (and thus
    `validateCrossings` + difficulty) untouched — the full carry width holds across `|s| ≤ 1.2·halfWidth`
    and only the OFF-corridor arms change: (1) **`widthAt` now TAPERS** — the +arm (mouth) swells
    downstream toward its lake, the −arm (source) narrows to a thin trickle (`half·0.24` floor), so the
    river reads as flowing FROM a headwater instead of a blunt band with two rounded-nose ends (this alone
    kills most of the "stops out of nowhere"); the meander `ampFrac` was widened (0.26–0.52) for more
    wander. Pure geometry — `riverChannel` still draws its SAME 10 rng values in the same order (only the
    shape they describe changed), and it now also returns the `source` point. (2) **`riverTerminals`** gives
    both ends a believable terminus for variety: the mouth pools into a LAKE (as before), and the source
    gets — picked from the stream — a small SPRING pool it wells out of, a stand of TREES it emerges from
    ("out of the woods"; water/frost only — lava has no grove), or nothing (the tapered trickle just peters
    out). Every added body is gated by `clearsPlayCorridor`, so the pools stay fair penalty side-hazards and
    the grove (trees are fairness-exempt anyway) is kept off the corridor. `GENERATOR_VERSION` 12→13 (the
    armed river holes' downstream stream shifts — feature-OFF/calm holes are byte-identical since the whole
    river block is wildness-gated). All property guards hold: `validateCrossings`/`validateFairness` empty
    across worlds/seeds, the ember-river + frost-pond no-death-spiral bars (`tests/zones.test.ts`), and
    render-blend still see creek/lavariver bodies. Eyeball a `creek`/`frozenpond`/`lavariver` study set
    (busiest at `wildness 0.9`) after any further tweak.
  - **Follow-up: VARIABLE crossing placement + character breaks the "every hole is the same shape" read
    (GS-rivers-2).** Player report: "the enforced fairness layer is what makes the holes keep the exact
    same shape — vary WHERE the river crosses and whether it's straight/diagonal/winding for more
    interesting layouts (still fair)." Diagnosis: fairness only constrains the CARRY WINDOW, not where in
    it the crossing sits — but the generator hard-coded `t = rng.range(0.34, 0.6)` (always the middle
    third) at a uniform `theta = ±0.55` (always a moderate diagonal), so every water hole read the same.
    Two changes in `riverChannel`, both fair BY CONSTRUCTION (there is NO retry — `generateCourse` throws
    on a `validateCrossings`/`validateFairness` failure, so the crossing must be provably valid, not
    hope-it-passes): (1) **a CHARACTER profile** drawn up front — `character < 0.30` STRAIGHT
    (near-perpendicular `theta ±0.16`, gentle arms), `< 0.68` DIAGONAL (a real angled carry `theta
    ±0.34–0.80`), else WINDING (moderate angle, `ampFrac 0.46–0.74` so the ARMS wander hard while the
    carry itself stays a clean single crossing — the meander is still anchored to 0 across the corridor).
    (2) **variable POSITION** — the caller now passes a WIDE raw `t = rng.range(0.08, 0.92)` and
    `riverChannel` clamps it into the fair window `[0.15 + dt, 0.80 − dt]`, where `dt = 2·half /
    (cos(theta)·arcLen)` is the centreline fraction a band of that thickness+angle spans — so both banks
    provably stay inside `validateCrossings`' `[0.12, 0.82]` (lay-up room before, green room after) with
    margin, and the crossing can be an early tee-shot carry, a mid-hole hazard, or a late approach carry.
    The character params REPLACE the old single `theta`/`ampFrac` draws (net a few more draws, reordered);
    all still inside the wildness-gated block, so calm/feature-off holes are byte-identical.
    `GENERATOR_VERSION` 13→14. Full suite green (870): `validateCrossings`/`validateFairness` empty across
    every world/seed/wildness (the by-construction clamp proven by the suite's generate-or-throw), the
    death-spiral bars hold. If the clamp is ever loosened, the suite THROWS at generation (its own guard).
    Eyeballed a 6-wide `creek` + `lavariver` variety sheet: crossings now sit early/mid/late at varied
    angles + straight/diagonal/winding characters.
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
- **Per-CATEGORY distance control (GS-proshop-distance-items).** Four Pro Shop items each raise the min
  carry of ONE club FAMILY toward its max — resolved by `flightClassOf` (driver/wood/hybrid/iron), so a
  `carryControlFor(clubId, carry, opts)` call only tightens the matching family (via new loadout field
  `minCarryBoostByClass`, a `Partial<Record<FlightClass, number>>`, additive per family, folded by
  `addFamilyMinCarry`). **Woods/Hybrids/Irons** are pure precision (rare / rare / epic, no downside).
  **Driver** (epic) keeps its MAX carry (average even rises) but pays a different trade-off: a `driverPowerFloor`
  (0.84) remaps the driver's POWER gesture into `[floor·full, full]` — 1% power lands at the raised min carry,
  full power at the max — so the driver can no longer be dialed SHORT (club down to lay up around a hazard or
  on a short hole). The floor is a POWER remap (`driverPowerFloorRemap`), NOT a carry-window clamp, applied
  in `resolveShot` (the intended-carry) and `shotSpread` (the previewed cone) — and in `executeShot`'s
  upwind aim so the aim matches the floored carry. Interactive-only in effect (the auto sim plays full
  swings → remap no-op; power 1 and every non-driver are byte-for-byte). All threaded IDENTICALLY through
  the auto sim (`playHole`) + interactive driver (`takeShot`/`previewShot`) so auto ≡ interactive; ZERO
  extra rng, rebuilt from perk ids on resume (no save bump). `tests/distance-items.test.ts` guards per-family
  isolation, the driver power-floor (max held, low-power can't dial short), and contract 4.
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
- **Ball flight is PER CLUB FAMILY (GS-flight-3, `src/sim/flight.ts FLIGHT_PROFILES`).** The old model
  was ONE loft-interpolated parabola (`sin(πt)` in Bézier param) for every club — and because the curved
  path's ground progress is `2t−t²` (fast early, slow late), every apex landed at ~75% of ground distance:
  all flights read low-and-late, so a 7-iron got knocked down by scenery golf intuition says it clears.
  Now each family (driver/wood/hybrid/iron/wedge/putter) has a `FlightProfile` row — `peakMult` scales the
  loft-interpolated apex HEIGHT (driver 0.85 bores, hybrid/wedge 1.12 balloon — hybrids are the
  high-launch rescue identity) and `apexAt` places the apex along the GROUND (driver 0.60 → wedge 0.70;
  `flightApexT` converts to the Bézier param via `1−√(1−apexAt)`, exact for a straight shot). The height
  curve is a two-piece sine peaked at that param (`arcHeight(apex, t, apexT)`; the 0.5 default reproduces
  the legacy `sin(πt)` exactly — putts/`sampleFlight` untouched). Families come from `flightClassOf`, the
  SAME id-convention classifier the audio strike voices use (now defined in flight.ts, audio delegates) —
  a new club row picks up flight + voice with zero engine edits. `FlightProfile` is threaded through EVERY
  consumer so none can disagree: `resolveShot` (family-shaped `ShotResult.apex`), `flightKnockdown`/
  `flightBlockedBy` + `tentFlightHit` (a REQUIRED param — no silent neutral default), `ShotSpread.flight` →
  `sprayBlocking` (the aim overlay's blocked shading now visibly changes with club selection — the
  club-choice lever), and `sampleCurvedFlight(…, apexT)` (the animated ball tows/bores per family).
  Zero rng anywhere in flight geometry, so streams are untouched; knockdown OUTCOMES shift, so the
  no-death-spiral harness was re-run: `toPar/hole` 0.727 → 0.673 at max wildness (blow-ups 0%,
  knockdowns/hole 0.36 → 0.32) — the AI's iron/wedge approaches clear more trouble than the boring
  driver loses. Real-world flights are proportionally HIGHER than the game's — the fracs stay game-scaled
  to the 7–22y canopies on purpose (raise them and trees stop mattering). Launch angles land arcade-true:
  driver ~12°, wedge ~25°. Guards in `tests/flight.test.ts` (classifier coverage, hybrid>wood, family
  knockdown split: the same grove blocks a driver line while a 7-iron flies it) +
  `tests/spray-blocking.test.ts` (club-aware blocked overlay). The profile table is the hook for
  flight-shaping Pro-Shop gear (IDEAS GS-flight-shop).
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
    - **GS-cetus-gaps made the island-hop chains COMPLETABLE BY CONSTRUCTION.** Field report (low-
      difficulty Voyage): deep Cetus (and Void) par 4/5 sometimes generated holes that could NOT be
      finished — the void gap between pads was beyond any carry, and the lost-ball penalty is a
      drop-back, so the hole looped forever. Measurement (40 seeds × 6 holes, both biomes): **11–13%
      of armed par-4/5s had an effective void carry over 175 relative yards, worst 782** (vs a 250-yd
      common driver) — at EVERY wildness, so it was never actually "fine at A4+"; higher-Ascension
      players just had the rare bag (+8 carry) and luck on the marginal holes (Ascension only tightens
      cuts/credits, the generator never sees it). TWO compounding root causes, both in the
      `if (lostRough && par>=4)` gap block: (1) the raw gap draws (centres 0.18 apart in u, half-widths
      up to 0.08) could OVERLAP or leave a sliver pad between them; (2) worse, `brokenCorridor` drops
      any pad run with <3 dense points, and at 19 corridor samples (u-step ≈0.056) the sliver pad
      routinely had <3 — so it VANISHED, silently fusing two drawn gaps into one 200–330 yd mega-void.
      Fix, all inside the lost-rough gate (every other world byte-identical; `GENERATOR_VERSION` 11→12):
      `separateIslandGaps` (pure, ZERO extra rng — the draws are unchanged, only the derived band edges
      move) clamps every gap to a wildness-ramped ceiling in carry-relative yards (`ISLAND_GAP_MAX_YD`
      100 at the 0.55 arming threshold → 150 at wildness 1, ~60% of a nominal driver — shot carry and
      hole length both scale with the biome's `carryMult`, so the budget holds on any world; computed
      against the ACTUAL centreline arc since island chains bend 1.4× harder) and separates gaps with
      guaranteed landable pads (`ISLAND_PAD_MIN_U`/`_YD`); lost-rough corridors sample DENSER
      (`ISLAND_SEGS` 37 vs 19) so a legal min pad always keeps ≥3 points and can never be dropped.
      `validateIslandHops` (wired into `generateCourse`'s throw, like the other fairness proofs) proves
      it per hole: every penalty-lie run along the centreline — merged across non-penalty slivers too
      short to land on (a ribbon NOSE can clip a bent centreline mid-gap for a few yards; that's no
      relief) — must stay under 175 relative yd (150 cap + the void's ±10% `carryJitter` headroom).
      Post-fix worst carries: 63–96 relative yd at wildness 0.55 (a mid-iron), 135–148 at wildness 1
      (a genuine heroic driver carry) — the low end is now fair with the common starter bag while the
      A4+ brutality the biomes are meant for is preserved. Guarded by `tests/island-gaps.test.ts`
      (sweeps both biomes across the armed wildness band incl. the 0.55 threshold, asserts every
      armed par-4/5 keeps ≥2 surviving pads, and that multi-gap chains still spawn). The death-spiral
      exemption (`BALANCE_EXEMPT_BIOMES`) and the GS-cetus-6 AI-hop TODO are unchanged — this fixes
      COMPLETABILITY, not scoring balance.
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
- **Cross-family hazard-overlap dedupe (GS-hazard-blend, 2026-07).** Hazards used to stamp onto each
  other freely — water pools over bunkers, sand over lava — a pile of stickers ("water and other
  hazards spawn on each other"). `dedupeHazardOverlaps` (end of `generateHole`) now drops any non-tree
  hazard whose polygon overlaps an already-accepted hazard of a DIFFERENT substance family
  (`HAZARD_FAMILY`: sand bunker/pot/waste, water water/creek/frozenpond, lava lava/lavariver, ravine,
  fescue). TREES are exempt both ways (anything may sit under a canopy — the one sanctioned overlap),
  and the forced-carry CROSSINGS always survive a clash (they're load-bearing: `validateCrossings`
  proves them; a blob that hit a crossing loses whichever was placed first). SAME-family overlaps are
  kept on purpose — the render union-merges them into one body (a creek pooling into its lake, pot
  chains fusing into one complex). The filter is pure geometry over already-drawn placements — ZERO
  rng draws, so every seeded stream is byte-identical; only which hazards SURVIVE changed. Guarded by
  `tests/hazard-overlap.test.ts` (no cross-family overlap across biomes/seeds; tree overlaps still
  plentiful; crossings still present).
- **Lost-rough island holes CLEAR the abyss of stray hazards (GS-cetus-water, 2026-07).** On Void &
  Cetus deep stops the fairway/green pads float in the abyss, and the abyss IS the only penalty. But
  the par-4/5 island CHAINS (GS-cetus-5) still ran the full ordinary hazard placement — flanking
  penalty blobs, ponds, the approach lake, greenside rings, greenside sand, fairway bunkers/craters —
  positioned at lateral offsets from a WIDE (`VOID_ISLAND_SCALE = 2.4`), bending island corridor. The
  result (reported with a screenshot): water pools and bunkers scattered over the clifftop pads and
  hanging in the deep, and water reading as if stamped over a bunker. Only the island-green PAR 3
  skipped its flanking hazards ("ponds in the void read wrong"); the chains never got that treatment.
  Fix: `clearVoidHazards` — a second pure, ZERO-rng post-filter run right after `dedupeHazardOverlaps`,
  gated on `lostRough` so every normal world and every CALM void/cetus stop (lost-rough un-armed, plays
  as ordinary rough) is byte-identical. It keeps a hazard only when it is NON-penalty (sand) AND its
  polygon overlaps a fairway/green/tee pad; every penalty pool and every void-stranded sand/tree blob
  is dropped. Sanctioned forced-carry crossings are exempted (load-bearing) though none spawn on these
  biomes. Net: the pads keep their genuine on-pad sand "clifftop coves" (Cetus's signature) while the
  deep is swept clean. Because the streams are untouched, no seeded rng test shifts (all 869 pass);
  verified across 240 armed island holes (void + cetus, wildness 0.95) — 0 penalty pools, 0 stranded
  blobs, all surviving sand genuinely on a pad — while calm stops keep their normal hazards.
- **Waste band is a tapered LENS (GS-hazard-blend).** `crossingBand` (the sandy waste break) tapers
  its thickness toward both ends (`0.3 + 0.7·sin(π·u)`) and finishes on rounded nose tips — a natural
  sandbelt blowout instead of a flat-cut road slab. Pure math on the SAME rng draws (count unchanged).

## GS-variety-3 — a hard hole need not be a long bendy clone (variety at mid-to-high difficulty)
Player report: "at higher difficulties, especially Rainbow Course, Void and Cetus, all the holes turn
into exceptionally long bendy holes that basically all look exactly the same." Directive: research
what makes golf holes hard AND interesting, then apply it to mid-to-high difficulty for a real range
of par 3/4/5 holes — "ignore balance and death spiral for this; we can tune balance/AI later, but we
can't make the game fun constrained to a limited AI playstyle." Research brief in
`reports/hole-variety-research-2026-07-08.md` (MacKenzie/Macdonald/Fried-Egg canon): the throughline
is **difficulty ≠ length + bend** — a straight hole defended by bunkering/width/green is interesting;
overusing doglegs is the monotony trap; force length distribution WITHIN each par; keep drivable/short
holes as change-of-pace; give the interesting holes genuine two-route optionality. `GENERATOR_VERSION`
19 → 20 (deliberate stream reflow — no byte-for-byte claim, like GS-variety-2).

Root cause (measured): at high wildness `chooseTemplate`'s shape mix **crushed the workhorse simple
shapes**. For a bendy world (void `doglegBias 0.45`) at wildness 1 the old formula gave ~8% straight,
**~0% plain dogleg**, and ~92% cape/hairpin/double — so every deep stop was a severe bend, and on the
long low-gravity worlds (void 1.4×, cetus 1.12×, Rainbow Course inherits its base biome) that read as
"exceptionally long bendy holes, all the same." Three coupled fixes, all in `generate.ts`:

- **`straightP` RISES with wildness** (`Math.min(0.30, Math.max(0.08, 0.06 + wildness·0.20 −
  doglegBias·0.06))`). The old `straightP` was *crushed* by a `−wildness·0.12` term to its floor at
  depth; now the deep stops GAIN straight holes (defended by length, the `widthScale` tightening, the
  rough gradient and the wildness-tilted greens — not a bend), while CALM stops keep ~their old low
  straight share so GS-variety-2's rich early shape vocabulary + dispersion-perk sensitivity are
  preserved. The heroic shapes stay common (`hairP`/`capeP`/`sP` keep biome + a gentle wildness term)
  but no longer crowd out the plain dogleg (the remainder). Measured after: void w1 ≈ 40% straight /
  12% dogleg / 39% cape+hairpin+double (was ~8 / ~0 / ~92); calm verdant keeps 38% dogleg and ~29%
  cape+hairpin+double. **Why surgical, not a flat lift:** a first pass made `straightP` a flat
  `0.34 − doglegBias·0.22` (no wildness term) — it tripled straight at CALM stops too, over-widened the
  mid-difficulty game, and diluted the pure-dispersion Caddie Lessons perk BELOW the "a power-up must
  improve scoring" bar (`tests/shop.test.ts`: −4 handicap went to −0.015 mean Stableford). Making
  straight rise WITH wildness (lift only where the problem is) restored it to +0.017 while still fixing
  the deep stops.
- **DRIVABLE par-4s persist at every wildness** (`pDriv = 0.15 + 0.06·(1 − wildness)`, was `0.12 +
  0.12·(1 − wildness)` — halved deep in). A short, heroic "have a go at the green" hole is one of the
  most interesting in golf; the old ramp deleted it exactly where variety was most needed.
- **Island STORIES for lost-rough par 4/5** (void/cetus). The old block drew 2–4 pads spread EVENLY
  down the 1.4×-bending chain — every one read as the same wiggly chain of blobs. Now a `story` roll
  picks a distinct gap pattern: **runway** (a long continuous plateau + one/two big carries clustered
  near the green), **island-green** (a generous landing plateau then a single demanding carry — the
  TPC-17 feel), **cape** (a heroic carry straight off the tee then a long run home), **stepping-stones**
  (a busy chain of short frequent hops), **staggered** (irregular positions + varied sizes). The chosen
  shape grammar (dogleg/cape/S — GS-cetus-5) rides on TOP, so a runway can drift gently while a
  stepping-stones S-bends between pads. All stories still route through `separateIslandGaps` and are
  proved by `validateIslandHops`, so the variety can never break the common-driver carry budget.
- **`ISLAND_GAP_MIN_YD` (36 course-yd) floors every gap** in `separateIslandGaps` (clamped under the
  carryable `maxGapU` ceiling so it never makes a gap uncarryable). The render dilates each pad by 14
  course-yd, so two pads closer than ~28 yd BRIDGE into one landmass — the void carry would render as
  solid ground (graphic ≠ physics). The floor keeps every hop a visible carry. (A bent chain can still
  fold two pads close *laterally* so their dilations touch — a pre-existing quirk of severe island
  bends, unrelated to gap width; `tests/biome-identity.test.ts`' pinned platform-count seed was re-pinned
  77 → 6 to dodge one such fold, not masked.)

Blast radius: `GENERATOR_VERSION` 20; re-pinned `tests/island-gaps.test.ts` THROWERS (re-hunted the
void `unending:<theme>:<dist>:<v>` raw-throw configs) and two `tests/biome-identity.test.ts` seeds.
NO death-spiral fence needed relaxing — reducing the severe-bend share is difficulty-NEUTRAL-to-easier,
so every bar (ember/frost <1.0, characters/biomes relaxed bars, void "bites") held; full suite green
(1052). NO new `_gs*`/URL hook (content-as-data + sim behaviour), so the test-hub guard needs nothing.
Verified with a rendered high-wildness sheet (void/cetus par-4/5 + Rainbow Course): straight par-4/5 now
appear beside doglegs/hairpins/S-curves, and the island holes range from 2-pad island-greens to 4-pad
stepping-stone runways. TODO(GS-variety-3-followup): the bigger levers from the research are still on
the table — named TEMPLATE holes (Redan/Cape/Biarritz/Short) as set-pieces, an anti-repeat scheduler
(bias each hole off the previous hole's shape/length/direction), angle-of-attack pin↔fairway-side
coupling, and moving more difficulty into greens (firmness/false fronts). Logged in IDEAS.md.

## GS-ship-corridor-contain — the derelict's side walls actually contain the ball (5th time's the charm)

**The report.** The derelict spaceship's signature is a walled hull-deck corridor: impassable metal
bulkheads line both sides, and the game promises "a sideways miss ricochets back onto the deck, never
lost to space" (that promise is what makes a tight, wind-blown, low-gravity hallway *fair*). Across four
prior attempts (GS-ship-walls #327/#329, GS-ship-corridor #330, GS-ship-pinball #350) the walls still
leaked: players kept losing balls that drifted into the side walls. This is the 5th pass, and it's a
root-cause fix, not another tuning nudge.

**Reproduction (the thing the earlier passes lacked).** A headless sweep firing full-power driver
tee-shots down real derelict corridors and classifying each rest showed **~25% of drives were LOST TO
SPACE despite the fully-walled corridor** — and, crucially, most rested only a few yards off the deck
edge. Two distinct leaks, one root cause:
- **Open boundary (~79% of the leaks).** A straight line tee→rest crossed ZERO walls yet the rest was
  off-deck. The corridor is a hard ZIGZAG (a 4-point centreline can swing ±130 yd with sharp-angular
  "ship junction" corners). The pre-built walls are two PARALLEL RAILS per corridor section; at a convex
  hard corner the rails from adjacent sections don't meet, and past the chain ends they simply stop — so
  the curved flight banana and the run-out reach off-hull spots THROUGH the corner openings and around
  the ends without ever crossing a wall SEGMENT. Parallel rails are not a closed fence.
- **Detection/reflection miss (~21%).** A wall did sit between tee and rest, but `wallFlightHit`'s
  segment walk / the pinball roll bounced the ball inward only for it to trickle off again, or reflected
  a grazing hit nearly parallel to the wall so it slid along the razor edge and off.

**The fix — the drawn deck IS the bulkhead (graphic ≡ physics).** Stop trying to make the segment fence
watertight on a corridor that bends this hard; instead treat the DECK the renderer draws as the physics
boundary, and add two deck-boundary layers in the shared `executeShot` (so auto ≡ interactive, and
gated on `hole.walls` so every non-derelict world is byte-for-byte unchanged, zero rng):
1. `flightBoundaryBounce` — when a shot LANDS lost-to-space at a station where the corridor is SOLID and
   the segment `wallFlightHit` didn't catch it, walk the same curved arc, find where it first left the
   hull deck, and ricochet it off THAT edge (reflect off the nearest drawn wall for a believable angle,
   forced inward toward the centreline so it can never point back off the deck). The ball lands back
   inside and sparks at the wall — a real mid-air bounce, no sail into open space.
2. `containToDeck` rest BACKSTOP — after the roll, any ball still off the hull at a solid station is
   pulled to the nearest deck (stepping toward the centreline) and the recovered point is appended to the
   run-out path so the ball visibly rolls back on. This is the *guarantee*: whatever the ricochet maths
   miss, the ball ends on the deck.

**"Solid station" vs a sanctioned gap.** A ball is only contained if the corridor is SOLID under it —
defined as: the centreline point nearest the ball is itself ON the deck. A rest whose nearest centreline
point is off-deck sits in a genuine torn-hull STAR-GAP (the island-hop forward carry) and is correctly
left lost. A `breach` rest is a deliberate on-deck acid-hole hazard and is excluded (`isLostToSpace`
gates on the `voidlost`-penalty off-hull lies `shiprough`/`voidrough`, never `breach`).

**The one subtle bug inside the fix.** The backstop seats the recovered ball a small margin PAST the deck
edge toward the centreline so it doesn't rest on the razor edge. But the generator can leave a thin (~2 yd)
sliver of SPACE between a `waste` steel-plate and the fairway — and the un-validated margin push shoved the
ball straight into that sliver (a "saved" ball that was still lost). Fix: re-validate the margin-seated
point and fall back to the deck point actually reached if the push would cross back into space.

**Verification.** After the fix: **0 genuine lateral losses across 444,744** seeded shots (multiple clubs,
powers, tee + mid-corridor lies, wildness 0.2→1.0), down from thousands. Visual health: 84% of wall-bounce
shots visibly LAND on the deck and 98.5% come to REST on the deck (the remainder are legit gap/breach
carries). Full suite green (1119 → 1121 with two new end-to-end regressions in `tests/walls.test.ts` that
assert no resting ball is still `containToDeck`-able and that a recovered ball is never seated in space —
the synthetic reflection unit tests could never catch a real-geometry leak).

**The transferable lesson (why five attempts failed).** Each earlier pass improved the SEGMENT collision
(bounce it back harder, pinball it, raise the wall). None could win, because a pre-built segment fence
fundamentally cannot contain a ball on a bending, breaking corridor — the openings are structural, not a
tuning value. For any future "walled" or otherwise-contained world: make the DRAWN PLAYABLE SURFACE the
physics boundary and back the invariant with a rest-time containment guarantee, rather than trying to seal
a parallel-rail fence. And reproduce the failure headlessly with real generated geometry FIRST — the bug
was invisible to synthetic straight-wall unit tests and obvious the moment real zigzag corridors were swept.

## GS-ship-wall-bounce — the FLIGHT bounces off the drawn deck, not a wall segment (6th pass)

**The report (with a marked-up screenshot).** GS-ship-corridor-contain (above) fixed the *rest* — no ball
comes to rest off the hull at a solid station. But the containment backstop moves the resting point; it
does NOT change the **flight animation**. So a drive drifting off a solid stretch of hull still *visibly
arced past the bulkhead into open space* and then snapped back — the ball "treated the deck edge as if the
wall weren't there." The player's exact words: "it should have hit and bounced off the corridor wall
instead of arcing." The primary flight collision was still the per-segment `wallFlightHit`, which leaks
through the same hard-corner openings / chain ends the containment pass documented — and `flightBoundaryBounce`
only fired when the shot *landed* lost-to-space, so a ball that leaked off a solid section but sailed on to
land in a torn-hull gap (or bulged out and back) never bounced.

**Reproduction.** A headless sweep (46,040 seeded derelict drives) reconstructing the exact curved flight the
renderer draws found **~11% of drives had a flight arc that crossed off a SOLID stretch of hull without any
registered bounce** — the visible "arced past the wall" bug — and **8.7% still ended lost-to-space**, ~half of
those (2,089) *after* the flight crossed a solid section it should have bounced off (it kept going into a gap
and was lost there — an unfair loss the walls were meant to prevent).

**The fix — `flightWallBounce` (deck-boundary flight collision).** Replace `wallFlightHit` as the physics
flight collision in `executeShot`. Walk the curved flight; bounce at the **first point the ball leaves the
hull deck (`isLostToSpace`) at a SOLID station** (`corridorSolidAt` — nearest centreline point is on-deck).
Reflect inward off the nearest drawn wall's angle with a toward-centreline fallback (`inwardReflect`), so it
always comes back inside even where the wall rail is broken. Because a bulkhead towers over the shot-apex cap
there is no height gate — every sideways escape bounces. This keys off the DRAWN DECK, not a wall SEGMENT, so
it cannot leak through the corner openings / chain ends (there is no wall segment at a leak point — which is
exactly why per-segment collision missed it, and why keying the bounce off wall *proximity* also fails: an
early experiment doing that regressed the catch rate).

**Why a forward gap carry still flies clean.** The smoothed centreline runs CONTINUOUSLY through a torn-hull
star-gap even though the deck is torn there, so a ball over the gap reads a NON-solid station and is left
alone; only a ball off a continuous stretch of hull (nearest centreline still on-deck) ricochets. This is the
same solid-vs-gap discriminator the containment pass uses, applied per flight step instead of only at landing.
`wallFlightHit` is retained solely to feed the **aim cone** (`sprayBlocking`) — deliberately left on the
cheaper per-segment check (the cone probes N×K hypothetical flights per aim frame; `corridorSolidAt`'s
centreline search is too costly there). The physics bounce is now a strict superset of what the cone flags, so
the only divergence is a *pleasant* surprise (a ball the cone showed clear is saved back onto the deck), never
the frustrating direction (cone blocked but ball flies clean).

**Verification.** After the fix: **100% of first-departure flight leaks gone** (a solid-stretch escape always
bounces) and **lost-to-space more than halved (4,015 → 1,823 across 46,040 drives)**. The residual losses are
legit gap under-clubs plus rare post-gap-transition drifts (the ball already legitimately over a gap, then
passing beside a later section) — the `containToDeck` rest backstop still guarantees none rests off a solid
station. Full suite green (1,121 → 1,122) with a new end-to-end regression in `tests/walls.test.ts` that
reconstructs every resolved drive's flight and asserts none leaves a SOLID stretch of hull without a bounce.
`flightBoundaryBounce` is removed (subsumed). Pure geometry, ZERO rng, derelict-only — byte-for-byte elsewhere.

**The lesson (compounding the 5th-pass lesson).** "Make the drawn surface the physics boundary" applies to the
FLIGHT, not just the REST — a containment pass that only corrects the resting point leaves the animation lying
about the wall. If the graphic shows an impassable wall, every phase of the ball's travel (flight AND roll)
must bounce off the drawn edge, not a pre-built segment.

## GS-ship-wall-bounce (render) — the wall GRAPHIC finally sits on the bounce line

**The report (two screenshots).** "The walls bounce well, but two things: (1) the black wall graphic
doesn't match where the ball bounces — it bounces off the fairway/ship deck edge instead; (2) there's a
hidden bounce-back wall out in space — you can't actually go OOB except through the star-gaps."

**The diagnosis.** Both symptoms are ONE gap. The ball can only land/rest on the fairway CORRIDOR poly,
and `hole.walls` sit exactly on that corridor edge — that IS the bounce line, and containment guarantees
a return there (a 140-yd sideways miss still rests on the fairway). But the RENDERER draws the hull deck
~14 yd WIDER: `lostPlatformsCourse = dilateUnion(fairway, +14)`, plus the extruded hull cross-section and
a bright jagged torn-hull deck-rim (`SHIP_CLIFF.lip*`). So the outermost bright edge you SEE is ~14 yd
OUTSIDE the bounce line; the ball bounces "early," inside the visible ship, and that dead margin (where
`lieAt`→`shiprough` = lost) reads as landable deck. Symptom 1 = the bright torn rim, not the wall, reads
as the boundary; symptom 2 = containment pulling a ball out of that grey margin reads as an invisible
wall in space (the only true OOB is the star-gaps, which is correct — the player was happy with that).

**The decision (asked).** Keep the physics boundary; make the WALL you SEE coincide with it. (The other
options — widen play to the whole hull, or shrink the hull to the corridor — were rejected in favour of
the lowest-risk render-only fix that keeps the dramatic wide-ship look.)

**The fix (render-only, derelict-LOST-only).** `styleShipWalls(…, bold)` draws, on a lost hole, an
UNMISTAKABLE bulkhead on `hole.walls`: a thicker/brighter lit CREST tracing the exact bounce line, plus
an OUTWARD cast shadow that sinks the dead-hull margin behind it so it recedes as backdrop. `SHIP_CLIFF`
lip alpha is dropped (0.85/0.7 → 0.5/0.42) so the outer torn rim no longer out-shines the crest. Calm
derelict holes (off-corridor is fair rough, the walls don't bounce) keep the subtle interior-partition
look byte-identical, so nothing there is misrepresented as impassable. Zero rng, camera-proof (constant
prim additions), every other world untouched.

**The lesson.** When "the drawn surface IS the physics" but the drawn surface is a DILATED/decorated
super-set of the collision poly, the graphic lies again — from the other side. The bounce line needs a
graphic that sits ON it and out-shines the decorative silhouette drawn past it, or the eye locks onto the
wrong edge.

## GS-ship-space-boundary — past the bulkheads, the ball flies FREE (the containment was over-reaching)

**The report (three screenshots).** *"The void zones between the hulls are correctly lost balls, but
beyond that, the far space boundary is kicking the ball back instead of letting the ball fly free."* The
purple flight/roll trails looped WAY out into the starfield — well past the visible ship — and boomeranged
back onto the deck, off an invisible wall where no bulkhead is drawn.

**The diagnosis.** GS-ship-corridor-contain (5th pass) and GS-ship-wall-bounce (6th) made the DRAWN DECK
the physics boundary via a `corridorSolidAt` discriminator — "the centreline point nearest the ball is on
the deck." That is a great *forward* discriminator (solid hull section vs. torn-hull star-gap), but it is
UNBOUNDED sideways: a ball 145 yd out in open space, abeam a solid section, still has its nearest
centreline point on the deck, so both the flight ricochet (`firstSolidDeparture`) and the rest backstop
(`containToDeck`) treated it as "contained" and reeled it home. Headless sweep (27,468 sideways derelict
drives): **519 flew >40 yd (up to 145 yd) off the nearest *drawn* wall then got pulled back; 9,157 flight
bounce-vertices ricocheted off empty space** (up to 54 yd from any bulkhead) — the invisible far boundary.

**The fix (`CONTAIN_MAX_WALL_DIST` = 22 yd).** Gate BOTH containment layers on a real bulkhead within 22 yd
of the departure/rest point (`nearestWallDist`). Near-edge misses — a few yards off a solid stretch, which
covers the +14 yd drawn dead-hull dilation AND the hard-corner NOTCHES between rail ends — still get caught.
But a ball flung far past every bulkhead (through a torn-hull gap OPENING, or clean past the wall chain ends)
has nothing to bounce off, so it flies FREE / stays lost. Result: reeled-from-far-space **519 → 0**, flight
ricochets off empty space **9,157 → 0**, and **3,568 sideways drives now correctly fly free** into the void.

**Why this is NOT the failed "proximity-as-primary" experiment (GS-ship-wall-bounce, above).** That pass
noted keying the bounce *off wall proximity* regressed the catch rate — because at a hard-corner opening
there is no wall segment, so a proximity-primary test misses exactly the leaks the deck discriminator
catches. The distinction: `corridorSolidAt` stays the PRIMARY catch; wall proximity is only an UPPER BOUND
layered on top to *exclude* genuine open-space excursions. A corner notch is a few yards wide, so its
departure point is still well within 22 yd of the adjacent rail ends → still caught. Verified: plain-corridor
lost-to-space held at **2.41%** (<5% bar) — the notch/chain-end catch did not regress; only far-space losses
(which the player WANTS) were added.

**The design amendment.** "A sideways miss ricochets back, NEVER lost to space" is now bounded: contained
where a bulkhead EXISTS, free past it. Open space is a real, fair loss — the walls line the corridor, they
do not wrap the whole starfield. Regression (`tests/walls.test.ts`, `GS-ship-space-boundary`): a ball flung
far past the bulkheads is not reeled back, and no flight bounce-vertex sits far from a drawn wall. Pure
geometry, ZERO rng, derelict-only (`hole.walls` gate) — every other world byte-for-byte unchanged.

## GS-ship-calm-space — the derelict is walled space at EVERY wildness (calm off-deck is lost too)

**The report.** *"Almost perfect in the harder difficulty versions of derelict ship, but in the calm
version the walls don't exist and you can hit it directly over the wall into the rough sections."*

**The diagnosis.** Walls (`hole.walls`) are stamped on every derelict par-4/5 hole at all wildness, but a
wall only *bounces* a ball when the off-corridor lie is `shiprough` (lost to space) — the containment
(`shipFlightPath` / `containToDeck`) is gated on `isLostToSpace`. Lost-rough was armed only at
`wildness ≥ LOST_ROUGH_MIN_WILDNESS` (0.55), a threshold SHARED with void/cetus ("below: play as ordinary
fair rough"). So a calm derelict stop had fair, playable ROUGH off the corridor, nothing went lost, the
bulkheads never fired, and the subtly-drawn wall read as something you could fly right over — a
graphic-lies-about-physics gap, the exact class of bug the whole ship-wall saga fought. Measured (seed 7):
off-corridor lie was `rough`/`deeprough`/`fescue` at wildness 0.15–0.5, only `shiprough` at 0.8.

**The decision (asked).** The player chose "calm plays like the hard version" — walled space at every
difficulty. The derelict's identity is sealed corridors in the deep, and a calm parkland-with-rough reskin
loses it.

**The fix (`lostRoughMinWild = biome.walls ? 0 : LOST_ROUGH_MIN_WILDNESS`).** Arm the derelict's lost-rough
at ALL wildness — off the deck is always `shiprough`, so the bulkheads always contain. Gated on `biome.walls`
(the derelict is the only walls world), so void/cetus keep the 0.55 threshold and are byte-for-byte unchanged.
`GENERATOR_VERSION` 26. Verified: 1,600 calm derelict courses generate with **zero validator/`validateIslandHops`
throws** — the calm island-hop holes are completable by construction (fair-but-brutal, and the derelict is
`BALANCE_EXEMPT` so no death-spiral gate applies). Off-corridor is `shiprough` at every calm wildness, zero
fair rough; void/cetus calm stays fair rough.

**Test fallout (honest, not loosened).** Two `walls.test.ts` proxies asserted "plain (continuous-wall)
corridors contain ~99%." That population barely exists now — the derelict is uniformly walled-space with
hull-section + side-wall gaps at every wildness, so a bounce shooting a sanctioned gap into space is common
and CORRECT (the awkward-bounce-out-a-gap the player also wanted). The real "no sideways leak off a SOLID
stretch" guarantee is unchanged and still guarded by `GS-ship-corridor-contain`'s resting-containment test
(no ball rests off a solid stretch containably). The proxies were retired and replaced with the still-true
behaviours (walls bounce many balls onto the deck; awkward bounces shoot gaps) plus a `GS-ship-calm-space`
guard (calm derelict is space off the deck; calm void/cetus stay fair rough).

**The lesson.** A world's off-fairway PENALTY and its difficulty RAMP are separable knobs. Sharing one
`wildness` threshold across worlds that want different calm feels (void = gentle fair rough, ship = always
sealed) couples them wrongly; a per-world floor (`biome.walls ? 0 : …`) decouples them for one world without
touching the others' streams.

---

## GS-ship-corridor-fold + GS-ship-wall-phantom + GS-ship-breach-restore — the derelict's walls stop lying (7th pass)

**The report.** *"If the ball lands close to the wall, when you hit the ball, even if it's not going close
to the wall it clips the 'bounce' effect and goes in a completely different direction than what it looks
like it's going to do graphically. It's especially bad around dog legs when you land on the inside path and
it looks like you have a clean shot, but then the ball clips a wall and bounces into the void. Additionally,
there doesn't appear to be any acid etched hole hazards that show up at all."*

Three separate bugs, all of them the same shape: something the player can SEE disagreeing with something the
sim does. Every one was found by measurement, not by reading the code.

### 1. The corridor had invisible holes in it at every bend (`GS-ship-corridor-fold`)

`ribbon` offsets the centreline by a MITRE (`p ± normal·halfWidth`). On the inside of a bend, once the
half-width outgrows the turn radius, that offset edge crosses ITSELF and encloses a little bowtie — and
`pointInPoly` fills **even-odd**, so the bowtie reads as *not fairway*. On an ordinary world that is a patch
of rough nobody notices. On the derelict, off-corridor is open SPACE, so it is a **phantom void punched into
the middle of the deck**: the renderer draws solid plating over it (the render layer offsets with the
fold-proof `dilateUnion` — the very function written to fix this same fold on the Cetus pads), no bulkhead
stands on it, and the ball ricochets off nothing or is lost mid-deck. Measured over 398 walled holes:
**13% carried a fold, up to 15.5 yd across**, concentrated on exactly the shapes the player named —
`*-dogleg-*`, `*-double-*`, `*-hairpin-*`, `*-cape-*`.

**The fix.** `unfoldOffsetEdge` — the standard offset-curve cleanup: walk the edge polyline and, wherever
segment *i* crosses a LATER segment *j*, splice the loop out (keep the crossing point, resume at *j+1*), so
the corner is cut by a straight chord instead of folding back. Both the deck ribbon (`brokenCorridor`) and
the bulkhead rails (`buildShipWalls`) now build from ONE shared `ribbonEdges`, cut into the same
`corridorRuns` — previously the rails were framed off the GLOBAL point list while the deck was framed per
run, so the two quietly drifted apart at every gap edge. Result: **13% → 2%** of walled holes fold. The
residue is the genuinely SELF-OVERLAPPING corridor (a hairpin whose two limbs cross), which no single simple
band can model; it is held harmless by fix 2 instead of by geometry. Gated on `biome.walls` (`unfold` flag),
zero rng, so every other world's ribbon is byte-for-byte the old mitred edges.

### 2. The ricochet fired off bulkheads that were not there (`GS-ship-wall-phantom`)

A headless sweep of 74,213 shots aimed straight down real derelict corridors: **2,348 bounced, 995 of them
(42%) invisible to the aim cone, and 520 bounced with the whole flight line more than 6 yd from every drawn
bulkhead** — 287 of those more than 16 yd away. Two-thirds of the surprises turned the ball ≥30°. Two causes,
both "the graphic isn't the physics":

- **The aim cone had its own predictor.** `sprayBlocking` probed `wallFlightHit` (per-SEGMENT collision along
  a CURVED parkland arc); the sim resolved `firstSolidDeparture` (the DRAWN DECK boundary along a STRAIGHT
  corridor line). Two sources of truth for one bounce, and they disagreed 42% of the time — so the cone
  promised clean shots the ball never played. `wallFlightHit` is now DELETED and the cone probes the sim's
  own predicate: one departure per cone ANGLE (the derelict's flight is a straight line, so the departure
  found at the far radius is the one every shorter radius on that line meets) instead of the old K-deep
  radius loop. Exact instead of approximate, and cheaper.
- **A departure could bounce off a rail 22 yd away.** `CONTAIN_MAX_WALL_DIST` was shared between the resting
  backstop and the mid-air carom. Those are not the same problem: nobody watches where a stopped ball gets
  tucked back in, but everyone watches the ball turn. The offenders were the ribbon's rounded END CAP at a
  torn-hull gap lip and the notch inside a hard corner — drawn deck with nothing standing on it. The flight
  now needs a bulkhead within `FLIGHT_BOUNCE_MAX_WALL_DIST` = 6 yd; the rest backstop keeps its 22.
- **And the biggest one: a clean CARRY was being slapped back at the lip.** `firstSolidDeparture` bounced at
  the first off-deck sample at a "solid station", but a gap lip's nose bulges forward, so its nearest
  centreline point is still on the solid side. A ball flying a sanctioned carry across a torn-hull gap — or
  cutting the corner of a dogleg over the notch between two limbs, *the player's exact scenario* — got
  caromed sideways off nothing at the lip. The rule now: **deck ahead on your line is a promise the ball
  flies on.** A departure only ricochets if the deck does NOT resume further along the segment.

Measured after: over the same sweep, **zero** bounces on shots aimed down the corridor; over 19,400 fanned
tee shots, every one of 9,420 bounces was shaded by the cone (0 surprises), bounces down 24% and balls lost
to space down 2.8%. The corridor still pinballs — it just only pinballs off bulkheads you can see.

### 3. There were no acid breaches AT ALL (`GS-ship-breach-restore`)

`clearVoidHazards` drops every penalty hazard on a lost-rough hole, because on an island-pad world the abyss
is the only penalty and a pond floating in the deep reads wrong. GS-ship-calm-space (above) armed the
derelict's lost-rough at EVERY wildness — which quietly routed every derelict hole through that filter and
deleted **100% of the ship's breaches** (measured: 0 breaches in 2,160 holes, at every wildness). The
world's one signature on-deck danger, the acid-etched hole through the plating, had silently stopped
existing.

**The fix.** A walled hole is a CONTINUOUS hull deck, not a chain of pads floating in the deep, so on it the
ON-A-PAD test is the whole rule and applies to penalty kinds too: a breach that sits on the deck survives, a
blob stranded in space is still dropped. Void/cetus keep the old rule byte-for-byte. Result: **0 → 2,831
breaches** over 1,565 walled holes, ~3 per hole at wildness 1, mean radius 4.5 yd on a 37 yd corridor
half-width, on 99.7% of wild holes — and `validateCourse`/`validateFairness`/`validateCrossings` stay clean
(the placement check was always a padded mirror of the validator; nothing had ever validated it because
nothing had ever survived).

**Test fallout (honest).** The caddy-guard invariant asserted `penalty !== 'voidlost'`, which a `breach`
also raises — so with breaches back, 1.8% of guard saves tripped it. The invariant is *never lost to SPACE*,
not *immune to hazards*: a guard save that runs 20 yd into a breach is the same fair outcome as one that
trickles into a pond on a parkland hole, and no other world's guard is hazard-immune. The assertion now
reads the rest LIE.

**One incidental win.** `lieAt` is the hottest read in the game and had no BBOX prefilter — dozens of 10–45
vertex polygons tested in full for every point. Putting the cone on the deck-boundary probe made that
visible, so `lieAt` now memoises per-hole bounding boxes and rejects cheaply. Behaviour-identical by
construction (a point outside a bbox cannot be inside the polygon); the whole aim cone got **~2× faster than
before this work**, and `tests/walls.test.ts` runs in 22s instead of 36s.

`GENERATOR_VERSION` 43 → 44. Guards: `tests/walls.test.ts` gains a fold-differential measurement (even-odd vs
non-zero winding is *exactly* the fold and nothing else), a `unfoldOffsetEdge` unit test, "a line the cone
called clear never ricochets", "every ricochet is at a drawn bulkhead", "a carry over open space is never
slapped back at the lip", and two breach guards. Full suite green (1,886).

**Known gap, deliberately left.** The greenside breach RING (`ringAllowed = !ship || !lostRough`) is still
off on the derelict for the same GS-ship-calm-space reason. Unlike the shoulder breaches that is not a
regression — it was only ever a calm-derelict feature — and re-arming it consumes new draws and reflows
every derelict hole, so it is a separate change (IDEAS.md).

**The lesson (the seventh time).** Every one of these three is the same failure: **two things describing one
boundary.** A render offset that can't fold vs. a sim offset that can. A cone predictor vs. a physics
predictor. A resting tolerance vs. a flight tolerance. Whenever the derelict's walls have lied, it has been
because some second description of the deck was allowed to exist. The rule is not "make the walls better" —
it is *there is one description of where the deck ends, and everything reads it.*

---

## GS-compose — a stop is a COMPOSED routing, not IID hole samples

**Player report.** *"Almost every biome has the exact same effective course layout, and increased
difficulty is almost always 'the hole gets longer'. I want to expand biomes into full 9/18-hole
courses, but they'd feel like the same 2–3 holes played over and over."*

**Diagnosis (see `reports/biome-hole-layout-variety-2026-07-13.md` for the full write-up).** Two root
causes. (1) STRUCTURE lives in engine code, not biome data — every hole is one tee→green corridor of
one of five centreline shapes, and a biome can only reskin it with scalars, so a data-only world is a
reskin. (2) A stop is `for (i…) generateHole(…)` — N INDEPENDENT, identically-distributed draws, with
no routing, sequencing, signature holes, or difficulty shape. Nine IID samples from one distribution
read as the same 2–3 holes repeated, and because the single `wildness` scalar pushes every lever at
once while the deep worlds are the low-gravity (long) ones, difficulty reads as "longer". This section
is the FIRST of a phased plan (composition first — highest felt win, lowest risk); per-biome
par/length/shape profiles, a per-biome difficulty vector, and generalised structural archetypes follow.

**The composition layer (`src/sim/course/compose.ts planCourse`).** A pure, deterministic planner on a
dedicated `${seed}:compose` side stream decides WHAT each hole should be; `generateHole` consumes the
plan. Four levers:
- **Par SEQUENCE** — a multiset whose proportions track the generator's own natural mix (~25% par-3,
  ~22% par-5, rest par-4), with a par-3 AND par-5 guaranteed once the stop is long enough, then ORDERED
  by a greedy triple-avoiding scheduler (place the most-remaining par that won't form a run of three,
  rng tie-break). Consecutive PAIRS are fine (real courses have back-to-back par-4s); a TRIPLE reads as
  "the same hole again" and is forbidden whenever the counts allow (they do for any sane mix). The
  single-swap breaker tried first couldn't clear a triple near the tail — the scheduler always can.
- **SIGNATURE holes** — one heroic DRIVABLE par-4 (golf's most exciting hole) and, on a stop ≥6, one
  stout LONG hole, chosen from the eligible pars. Fed to `chooseTemplate` as a forced `lengthClass`.
  Skipped on lost-rough island worlds and walled ship corridors (a drivable island-hop is nonsense) and
  on par-capped ladders (no length room).
- **Adjacent-SHAPE contrast** — the generation loop tracks the previous hole's shape family and passes
  it as `avoidShape`; if `chooseTemplate` draws the same family it rotates to a distinct one via a
  fixed-order deterministic remap (ZERO extra draws). Only the composed loop passes `avoidShape`, so the
  uncomposed shape distribution is byte-for-byte unchanged.
- **Difficulty ARC** — per-hole wildness opens gentle and builds toward the finish (a linear tee→green
  ramp) with a seeded ±0.16 breather/spike jitter so it isn't a flat monotone climb. It is
  MEAN-PRESERVING: the offsets are re-centred to sum to zero, so the stop's AVERAGE wildness equals the
  course wildness the death-spiral bar is tuned against — the arc changes hole-to-hole TEXTURE, not
  average difficulty. Amplitude `ARC_AMP=0.14` (per-hole delta ≈ ±0.09). At `wildness=1` the upper
  clamp bites, pulling the mean slightly DOWN (easier), so composition can never generate a hole wilder
  than the tested-safe max.

**Determinism / byte-stability.** Composition is OPT-IN via `GenerateOptions.compose`. Absent (every
direct `generateCourse` test, every single-hole slice, the whole balance/fairness harness) the planner
is never called and generation is byte-for-byte the old IID path — so no existing property/balance test
moved. `generateHole` still draws its `parRoll` even when a plan overrides par (stream position stable),
and each length branch in `chooseTemplate` still draws exactly one `range()` whether or not a
`lengthClass` forces it (draw COUNT stable). Only the run path (`runCourse.currentCourse` +
`stitchSplitCourse`, both halves) and `tests/compose.test.ts` opt in. `GENERATOR_VERSION` 22→23. The
run-path reflow legitimately shifted exactly TWO pinned fixtures: `formats.test`'s
currentCourse≡direct-generation check (the `direct` call now passes `compose:true` to mirror
production) and `ui.test`'s ace seed (699→107 — a reflow shifts which seeds ace, the same re-pin the
width grammar needed).

**Balance guard.** The IID death-spiral bar (`tests/biomes.test`) tests the UNCOMPOSED path, so
`tests/compose.test.ts` adds a COMPOSED bar with the same fences (`toPar/hole < 1.0`, blow-ups < 10%)
over non-exempt worlds at `holes:9, wildness:1` through the production `generateStopCourse` (retrying
the ~0.05% raw fairness edge case, which composition does NOT increase — measured identical 0.05% both
ways). The mean-preserving arc + proportion-matched par mix keep it comfortably under the bar.

**The lesson for the phased plan.** Composition sits ABOVE the frozen contract and the per-hole
generator — it needed no contract change and no new structural geometry, yet it's the change that most
directly answers "the same 2–3 holes". Build the variety MACHINERY (this, then per-biome profiles, then
structural archetypes) before adding biomes, so every future world is a genuinely different course for
free instead of another reskin.

---

## GS-biome-profile — a world owns a COURSE IDENTITY, not just a reskin

**The problem (Task 2 of the `reports/biome-hole-layout-variety-2026-07-13.md` plan).** GS-compose made a
STOP a designed routing, but every world still drew its holes from the SAME global distributions — one
par mix, one `doglegBias`-derived shape mix, one width-archetype pool. So a desert and a jungle, stripped
of palette, played the same golf. A biome could reskin the skeleton (gravity, wind, hazard colour) but
not own a DESIGN LANGUAGE.

**The fix.** Three OPTIONAL `Biome` fields let a world weight the levers that decide how its holes play:
- **`parMix`** `{p3,p4,p5}` — relative weights for the composed par sequence (`planCourse`). A desert
  leans par-5 (long), a tight jungle leans par-4, an exposed links leans par-3.
- **`shapeWeights`** — relative weights over the par-4/5 shape vocabulary (straight/dogleg/cape/double/
  hairpin), REPLACING the single `doglegBias` formula in `chooseTemplate`, so a world bends
  characteristically (desert straight+cape carries, jungle doglegs+S-curves).
- **`widthWeights`** — relative weights over the par-4/5 width pool (classic/chute/neck/hourglass/
  wander/thin/broad) in `chooseWidthProfile`, so a world's fairways run wide (desert broad/wander) or
  tight (jungle chute/neck/thin).

**Byte-stability by construction.** All three DEFAULT to the old behaviour exactly, so a world without
them is byte-for-byte unchanged and only an opted-in world reflows: `DEFAULT_PAR_MIX = {p3:.25,p4:.53,
p5:.22}` reproduces `round(n·.25)`/`round(n·.22)`; the default width weights `{classic:.28,chute:.13,
neck:.13,hourglass:.12,wander:.12,thin:.11,broad:.11}` cumulate to the OLD fixed chain
`.28/.41/.54/.66/.78/.89` (`cumWeights`); and `shapeWeights` absent keeps the old `straightP/hairP/
capeP/sP` formula. The weighted picks reuse the SAME already-drawn `shapeRoll`/`roll`/par draws (no extra
draws), so the machinery adds nothing to a default world's stream. Both weighted helpers apply to par-4/5
LAND holes only — the island/ship/par-3 pools keep their own recipes (width is survival on an island).

**The three proof worlds** (retuned; others untouched):
- **Dust Belt** — LONG, OPEN, HEROIC: more par-5s (`parMix {.18,.5,.32}`), straight/cape lines over the
  dunes, broad/wandering fairways. Difficulty is length + wind + sand.
- **Spore Jungle** — TIGHT, TWISTY, TECHNICAL: par-4 heavy (`{.28,.6,.12}`), doglegs + S-curves,
  chute/neck/thin corridors. The challenge is threading the line, tuned back from an early
  hairpin/thin-heavy build that spiked the max-wildness pick-up rate to ~15%.
- **Ice Ring** — EXPOSED LINKS: more par-3s (`{.32,.5,.18}`), sweeping S-curves the gale pushes,
  wander/thin wind-scoured shelves.

**Balance.** A profile RETUNES that world's generation at all wildness, so its death-spiral/fairness bars
were re-measured: the `biomes.test` aggregate holds (toPar/hole 0.759 < 1.0, blow-ups 7.73% < 10%, zero
fairness fails), the composed bar holds (0.642 / 7.32%), and the retuned worlds individually stay under
the fairness/termination sweeps. The reflow re-pinned two fixtures (the `ui` ace seed 107→63, and the
`scorch` conversion sample widened 60→80 seeds because dust-belt/ice-ring shifted their crater/green
placement). `GENERATOR_VERSION` 23→24. Guarded by `tests/biome-profile.test.ts` (the three worlds draw
genuinely different par/shape/width/length distributions; a profile-less world is byte-identical).

**Next (Task 3+).** A per-biome DIFFICULTY VECTOR (which levers ramp with depth — tightness vs wind vs
green-complexity — decoupling length from difficulty) and generalised STRUCTURAL archetypes
(split-fairway, then island/walled lifted from special cases into a registry a world picks from as data).

---

## GS-biome-difficulty — a world can get hard via its GREENS, not just length

**The problem (Task 3 of the plan).** The single `wildness` scalar ramps every difficulty lever together
(width tightens, bends steepen, hazards multiply, and — because the deep worlds are the low-gravity ones
— holes lengthen), so depth reads as "the hole gets longer". Two worlds at the same depth feel hard the
same way.

**The fix — a per-biome DIFFICULTY VECTOR, starting with the GREEN axis.** `Biome.difficulty` carries
multipliers on how the GREEN levers ramp with wildness, so a world can make its GREENS the test instead
of its length: `greenTilt` (plane-slope magnitude ramp), `greenComplexity` (2nd-lobe probability + lobe
strength ramp) and `pinTuck` (an edge-ward pin push scaled by depth). A desert with no `difficulty`
stays long-but-smooth; an ice world's shelves turn treacherous deep in — same depth, different hardness.

**Why the green axis is the SAFE first axis.** The slope, contour and pin all draw from DEDICATED side
streams (`:slope:`/`:contour:`/`:pin:`), exactly like the pin has since GS-6 — so nudging them leaves the
TERRAIN stream (corridor, hazards, crossings, fairness) byte-for-byte identical, and only a world that
opts in reflows its GREENS. Every lever CLAMPS so the default reproduces the old draw exactly
(`slopeFloor = min(.92, .4+.45·wildness·tilt)` — tilt=1 gives ≤.85, clamp never bites; the 2nd-lobe prob
`min(.95, .3+.45·wildness·cplx)` and lobe strength `min(1, .55+.45·wildness·cplx)` reproduce the old
`.75`/`1.0` maxima at cplx=1; `pinTuck` defaults 0 = the old centred 22–62% range). And it's bounded so
it's harder-never-unfair: slope/lobe magnitude stay ≤ `greenSlopeMax`, and the tuck clamps the pin to
≤85% of the ray-to-edge so `validateCourse`'s pin-in-green invariant holds for any star shape.

**Set on three GREEN-HARD worlds** (contrast to dust-belt, which is length-hard with no `difficulty`):
ice-ring (`{tilt 1.35, cplx 1.4, tuck 0.6}` — lethal shelves), ember-world (`{cplx 1.35, tilt 1.2, tuck
0.5}` — broken basalt), crystal-spires (`{tuck 0.8, cplx 1.2}` — precision to a tucked pin). Balance
re-measured: ice-ring rose 0.76 → 0.833 toPar/hole (the biggest, still < 1.0, blow-ups 8.1%); the
`biomes.test` aggregate holds (0.770 / 7.88%) and the composed bar holds (0.659 / 7.05%), fairness clean.
Note the auto-sim `onePutt` under-counts the felt cost — the harder greens bite most in INTERACTIVE
putting (the pace meter + break reads), so the true player-facing difficulty gain is larger than the auto
toPar shows. `GENERATOR_VERSION` 24→25; the reflow re-pinned one fixture (the `ui` ace seed 63→138).
Guarded by `tests/biome-difficulty.test.ts` (ice greens steepen/gain lobes/tuck harder from calm→deep,
far more than the desert; the desert's greens are byte-identical; heavy-tuck pins stay legal).

**Next.** The remaining difficulty axes — FIRMNESS (bouncy/soft greens) and FORCED-CARRY frequency/length
— touch the MAIN physics stream, so they're a heavier reflow deferred to a later pass; and the structural
archetypes (split-fairway, generalised island/walled) are Task 4.

## Green-END FLARE + variety (GS-green-flare — supersedes GS-green-end)

Player report (three screenshots, all modes): "almost all the fairways still share a similar shape
especially at the end where the green is, needs more flared fairways… the end of the fairway going to a
point, similar shape green, doesn't look smoothly joined together." Void/Cetus read fine (island greens,
no apron); the grounded worlds all read as a tapering corridor ending in a rounded lollipop head with the
green a dot inside it.

**Root cause.** The GS-green-end apron archetypes (SHELF/PUNCHBOWL/RUNOFF/TONGUE/OPEN) all built a
SYMMETRIC ribbon (`ribbon(line, HW, HW)`, same L/R array) that started at the corridor half-width and
swelled to a round `wrap ≈ greenR+9` centred on the green. Same fan, same round head, every hole — and on
a small green the wrap dwarfed it (the "dot in a patch").

**Fix.** The apron now FLARES like a real approach and leans, via a small station builder:
`build([{f, lat, l, r}…])` where `f` = forward distance from the green centre (− = corridor side), `lat` =
lateral offset of the apron centreline (× the approach perpendicular), `l`/`r` = the LEFT/RIGHT half-widths
(asymmetric → a leaning, non-mirrored fan). Six silhouettes off `gcRng.float()`: **FAN** (the headline —
fans to `wrap·1.35–1.7` just in front of the green, leaning to a seeded side, short tail), **PUNCHBOWL**
(wide oval gather, slightly offset), **RUNOFF** (broad flare flowing to a long tapering ramp past the
green), **TONGUE** (thin finger curling to a side), **DIAGONAL** (an angled cape — flares hard to ONE side,
the green tucked to the flank), **SHELF** (flares up to and STOPS at the green, rough behind). A seeded
`sk = ±1` picks the lean side; every skew is capped ≤ ~0.34·greenR (well under a half-width) so the green
always stays inside the fan and never floats on rough.

**Contracts.** Still drawn from the `${seed}:greencomplex:${holeIndex}` SIDE stream, so ZERO main-`rng`
draws are perturbed — terrain, penalty crossings, ponds, greens, pin, slope, greenside guards all
byte-identical; only the apron polygon (a fairway feature) changes. That IS a lie change near the green
(more fairway around the green → auto-sim outcomes reflow), so `GENERATOR_VERSION` 41→42; the full suite
stayed green with no re-pins (the balance bars are far from their fences — the change only eases the
greenside slightly, and Stableford can only rise). Fairness is untouched (`validateFairness` keys off the
FIRST fairway feature = the corridor). Skipped on lost-rough / ship worlds (island greens + ship decks have
no apron — the derelict gets a render-only deck blend instead, GS-ship-deck-blend). The apron→green→fairway
RENDER junction blend is a separate render-only pass (GS-green-blend). Re-shoot
`scripts/greenblend-preview.mjs` (mid/approach zoom, the player's decision distance) after touching it.

---

## Migrated from CLAUDE.md — System-index bullets (2026-07-23 refactor)

> These are the verbatim terse System-index bullets moved out of `CLAUDE.md` when it was
> compressed back to a lean constitution. They are the tip-of-iceberg pointers that had grown
> into full implementation histories in the root file. The durable *rule* now lives as a short
> bullet in `CLAUDE.md`; the detail below (and the deeper narrative already in this doc) is the
> archive. Nothing here is lost — it is just no longer cluttering the constitution.

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
    stream perturbed (contract 1), no test-hub wiring. Built for the Old St Annette’s course (below).
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
  - **THE PLAYER'S 🛟 GETS THE BALL OUT; TREES ARE NOW PART OF WHAT "SAFE" MEANS** (GS-safe-aim-trees,
    `round.ts safeAimTarget`, interactive only). `recoveryTarget` above fixed the AUTO sim's forest bomb,
    and only from a `trees`/`deeprough` LIE. The player's safe aim had the other half of the same
    problem and nobody had said so: a lay-up is a CORRIDOR decision — `clearLine` sees penalty hazards,
    `widthLayupTarget` sees corridor width, and a canopy is neither — so standing in the rough BEHIND a
    stand, "play safe" aimed straight into it and the only way out was to swing the aim round by hand
    and guess where the gap was (the play-test's *"360 no scope"*). Measured over 29,343 sampled ball
    positions on wooded worlds, the lay-up's own flight was **knocked out of the air on 13.7%** of them.
    `safeAimTarget` asks the sim's OWN knockdown walk (`flightBlockedBy`, the path `flightKnockdown`
    delegates to and the aim cone's blocked-zone overlay probes — the graphic IS the physics, contract 5)
    whether the lay-up would actually fly; if it would, that IS the answer, byte-for-byte, so the
    ordinary shot and every treeless world are untouched. If it would not, a fan of candidate targets is
    scored on forward progress, the LIE it finishes in (`LIE_INFO.carryMult`, reusing the sim's own
    ranking of how playable ground is rather than adding a second one) and how far off the intended line
    the player has to turn — then filtered on the four things that make an escape an escape: in bounds,
    on ground that is not the trouble being escaped, over no penalty hazard, and under no canopy.
    **3,928 of 4,017 blocked lines found a clean escape; 0 stayed blocked; the 89 that found nothing keep
    the lay-up** rather than inventing a target the shot cannot make good on. Mean turn off the intended
    line **20.4°** — it is a way through, not a spin.
    ⚠️ **The AUTO path must not inherit this**, or the interactive auto-finish stops reproducing the
    headless `playHole` byte-for-byte (contract 2) and every seeded fixture in the repo moves. So
    `autoDecision` now passes the `layupTarget` it chose its club and power for as an EXPLICIT `target`,
    which `aimTargetOf` honours ahead of the aim mode. That is not a workaround, it is the honest
    reading: the auto driver already computed the point it was clubbing for and was re-deriving it a
    function later by relying on the two paths sharing one helper.
    ⚠️ **The search sits on the decision RENDER, and 75% of its cost is `lieAt`** — one sample per
    candidate at ~23µs on a wooded hole, so the fan's step size is a cost decision as much as a feel
    one, and the two walks are ranked-then-lazy (best candidate first, stop at the first that survives).
    A one-entry memo keyed on EVERY input (hole identity, ball, lie, carry multiplier, the bag's ids —
    the `hashHole` idiom, GS-shot-lag) then pays it once per decision instead of ~4× per render: the
    club the screen pre-arms, the cone it previews and the line it orients the map down are all the same
    question. Cold 10.7ms → 5.4ms → ~0 on every repeat. Guarded by `tests/safe-aim-trees.test.ts`.
  - **AND THE DEFAULT AIM LAYS UP SHORT OF THE STAND** (GS-auto-aim-trees, `autoAimTarget`/`autoAimClub`,
    interactive only — the completion of `GS-aim-tree-aware`). The 🛟 pass fixed the mode a player
    switches to when they are already in trouble; ◎ is the mode everyone is in by default, and it was
    still pre-arming a driver on a line through a grove. **The fix is a different shape on purpose**:
    safe SEARCHES a fan and turns; auto may not turn at all, because its job is to position down the
    hole and the shot map ORIENTS down the resolved aim line (GS-default-aim) — a default that pointed
    45° into the rough would swing the whole camera off the corridor. So auto does what a player does
    when the trees are in the way and the hole is not: it lays up short of them, and it takes the club
    that gets there.
    Two seams, both extensions of rules that already existed rather than new machinery:
    **(1) the aim** — `flyableTarget` walks BACK down the ball→target ray to the furthest playable
    station something in the bag flies to, which is exactly the move `dryStationBefore` and
    `carryableBefore` already make for a wet target, with a canopy in place of a bank. It asks
    `longestCarryClub` twice, with the canopy clause and without, precisely so a null from BOTH — no
    club could carry the bank or land clean — is left alone: that is GS-carry-roll-real's answer to a
    different question. **(2) the club** — `longestCarryClub` gains a third clause beside "clears what
    must be cleared" and "lands playable": *and gets there through the air*. The flattest club in the
    bag is the one a treeline eats, so the walk steps down to the one that fits, which is what a player
    does. A reachable green is still ATTACKED, gated on `fliesTo`: when nothing can fly to the flag the
    attack is abandoned for the same lay-up the forced-carry rule already reaches for on water.
    Measured over 29,343 sampled positions on wooded worlds — shots pre-armed INTO a canopy **16.04% →
    6.63%**, tee shots **6 → 0**, and **77.8% of the residual is a genuinely trapped bag** (nothing in
    it flies that line at all — the feature never papers over that, and the census's own test is laxer
    than the rule, so the true share is higher).
    Three deliberate exceptions, each named because an unexplained one is a hole: a **par 3** always
    attacks the flag (there is nowhere else to aim, and the blocked cone over it says "shape this one");
    the green pick is **capped at the coverage club** (flying the green to dodge a tree trades a
    knockdown for the back-of-green trouble GS-green-backstop exists to make expensive); and a lay-up
    shorter than `AUTO_FLY_LAYUP.minYd` is refused (a chip-out sideways is 🛟's job).
    ⚠️ **`unblockedClub` asks the CANOPY question alone**, and the green attack uses it rather than
    `longestCarryClub`: the coverage club is chosen on TOTAL (carry + run), so the landing clause would
    reject a club that carries short of a creek and releases onto the green — good golf, and never that
    branch's business. Wiring the full rule in there was the first cut, and the guard caught it.
    ⚠️ **The shared memo returns a COPY on the MISS path too, not only on the hit.** Both resolvers can
    return a point that belongs to the hole (`pinOf` hands back the hole's own pin), so handing the
    computed value straight back would let a caller who mutates its target corrupt the course itself —
    and, through the cache, every later answer. Found by the memo guard, which mutates what it is given.
    Guarded by `tests/default-aim.test.ts`; the two older club guards there grew the canopy clause
    rather than an exemption, so "the step-down was FORCED" is still an assertion and not a trust
    exercise.
  - Greens are varied STAR shapes about `green` (single-valued r(θ)) — `pinInGreen`/`rayPolyDist`/
    `validateCourse` depend on it. Pin ≠ centroid (attack aims at flag; auto/safe at fat-of-green).
  - NO PENALTY HAZARD ON THE PUTTING SURFACE (GS-green-clear, `clearGreenOfPenalty`): the greenside
    placements ray-march a SINGLE line from the green CENTRE (`rayPolyDist`) and drop the blob just past
    where THAT ray exits — but a concave/STAR green fans lobes to either side of a near notch, so a 2-D
    blob lands in the bay and pokes onto an adjacent lobe. On a penalty greensideKind (lava = ember,
    water = ice-ring/toxic-mire/ocean, void, breach = derelict) that left molten/acid/void/water ON the
    green, blocking the putt to the hole (the player report: "ice/lava biomes get hazards on the green").
    The fix is the `clearVoidHazards` SIBLING — a PURE zero-rng post-filter (byte-identical streams; only
    which placed hazards SURVIVE changes) that DROPS any non-crossing penalty hazard sitting on the green
    surface or walling off the short-approach landing (exactly `validateGreenApproach`'s conditions, so a
    survivor can never violate them). Dropping never moves a blob into the corridor (no new fairness
    violation) and only RAISES Stableford (contract 4). CROSSINGS are exempt (they end before the green —
    `validateCrossings`); so is `validateGreenApproach`, which now EXCLUDES crossings from its flag/centre/
    short-approach checks (the `validateInFairwayWater` idiom) — a long ice SHELF green's big max-radius
    threw `shortPt` ~70 yd back onto a legitimate frozen-pond/creek CARRY, a spurious high-wildness crash.
    `GENERATOR_VERSION` 43.
  - The green-END FLARES + varies per hole (GS-green-flare, superseding GS-green-end): the fairway APRON
    used to fan to a SYMMETRIC rounded blob that started at the corridor width and swelled evenly around
    the green — so every hole-end read as the same "tapered snake head + lollipop", and a small green sat
    as a dot inside a round patch (the player report). Now the fairway genuinely FLARES into the green
    like a real approach: it widens to a broad, usually ASYMMETRIC fan whose widest point sits AT/just
    short of the green (a flared approach, never a point), leaning to a seeded side so no two complexes
    mirror, with a distinct per-hole silhouette — broad FAN, gathering PUNCHBOWL, long RUNOFF ramp,
    narrow TONGUE finger, angled DIAGONAL cape, or perched SHELF (no tail, rough behind). Built via
    `build([{f,lat,l,r}…])` — asymmetric L/R half-width arrays + a small lateral skew of the apron
    centreline (skews capped well under a half-width so the green never floats on rough). Drawn from the
    DEDICATED side stream (`${seed}:greencomplex:`, the pin/slope pattern), so it perturbs ZERO main-`rng`
    draws — terrain, hazards, pin, slope, greenside guards all byte-identical; only the apron polygon
    shifts (a fairway-lie change near the green — auto sim outcomes reflow, so `GENERATOR_VERSION` is
    bumped, not a stream reorder). Skipped on lost-rough / ship worlds (floating island greens + ship
    decks have no apron — the derelict gets a render-only deck blend instead). `GENERATOR_VERSION` 42.
    Sibling of GS-approach-hazards in the hazard/hole-END distribution follow-up to GS-biome-variety.
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
  - SHIP GREEN SEAT (GS-ship-deck-blend, `style/ship.ts styleShipGreenBlend`): the derelict gets NO grass
    apron (a ship deck is not a lawn — the player asked for no flaring here), so the mown turf green sat as
    a grass pad plonked straight onto the steel deck ("blend the fairway into the deck better"). Now the
    green is SEATED into a recessed deck BAY: a dark seam groove, two collar rings grading the turf edge
    down into the deck steel, and a cold machined steel LIP hugging the green — so it belongs to the ship,
    not floating on it. Drawn ON TOP of the deck plating, UNDER the green surface; the grounded worlds'
    grass green→apron blend (GS-green-blend) EXCLUDES the derelict for exactly this reason. Pure geometry,
    zero rng, derelict-only → every other world byte-identical.
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
    worst-hit worlds were the long low-gravity ones (void/cetus/Rainbow Course). DRIVABLE par-4s persist
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
    `buildStaticCourse(id)` and apply the chosen weather sky: `applyEffectPhysics` (wind/carry, NO geometry
    change) + the sky's GROUND MARKS (GS-weather-depth — scorch craters / stardust-ice-junk-tar-acid patches,
    seeded off the HOLE geometry so the same course+sky is the identical repeatable test; `playerHoleOpts`
    keys the headless arming off `staticEffect` for static rounds so auto ≡ interactive). The round is resolved like
    Asgard (a bespoke reducer path, not the Stableford-cut/travel flow) — the single stop IS the whole run.
    Records live in `sim/rpg/strokePlay.ts` (`StrokePlayBest` = courseId → best round, a MAP so a course's
    all-time best is never evicted; ranked by TO-PAR asc, ties → fewer strokes): two boards, per-course best
    + best-rounds-overall. Persisted in save v27 (`strokePlayBest`). Threaded through both the auto
    (`playCourse`+`playTotals`) and interactive drivers (contract 2). The mode does NOT touch Voyage/Unending
    behaviour.
  - EARTH — the HOME course (GS-earth): the one real-world course, St Annette’s Links, is the
    Star Tour destination you reach by flying to the Earth landmark. It is a NEW `earth` BiomeArchetype +
    `earth-links` Biome (a true Scottish LINKS: `carryMult` 1.0 — the only real-Earth gravity — seaside
    wind, treeless firm turf, deep revetted POT bunkers, fescue/gorse rough, the Annette BURN carry, huge
    undulating SHARED double greens). WEIGHT 0 + no pickable theme ⇒ out of the normal galaxy rotation,
    reached only by the static course forcing the biome by id (the Asgard pattern; kept mid-`BIOMES` so
    the last row stays positive-weight for the `pickBiome(0.999)` span test). NOT balance-exempt — a fair
    world, so it clears the fairness/death-spiral bars (auto-AI plays it ≈ even par). The `standrews-18`
    spec (`St Annette’s Links`) is an UNFROZEN tour row like the others EXCEPT it PINS the real
    par-72 routing (`opts.parSequence`, GS-hole-plan) and uses the designed difficulty ARC — NOT
    `STAR_TOUR_MIX` — so a real course opens gentle and builds through the closing stretch. A new
    archetype = a row in every archetype-keyed table (compile-forced: `ARCHETYPE_BIOME`/`ARCHETYPE_AFFINITY`/
    `ARCHETYPE_TURF`/`ARCHETYPE_SPACE`/`OB_LOOK`/`BIOME_RELIEF`/`WIND_COL`/`TREE_VOICES`/`TREE_GLYPH`/`PRO_LOOK`/
    `MUSIC_TRACKS`/`ZONES`/`PROS`; test-forced: `GROUND_COVER`/`WIND_RGBA`/`AMBIENT`; plus `BIOME_ROUGH`/
    `ACCENTS` by biome id, `DEEP_ROUGH`, a `zoneHeroSVG` branch), never an engine fork. Star map: Earth is
    the tappable St Annette’s target — `worldPos` special-cases `themeId:'earth'` → the blue-marble
    `EARTH_POS`, and `earthGlyph` (not a generic constellation planet) carries the selection ring + record
    + play flow. Guarded by `tests/startour-flow.test.ts`. Pure render/data + a static row — no `_gs*`/URL
    hook, no test-hub wiring.

---

## GS-green-backstop — going long is punished (2026-07-26)

**The ask** (playtest): "some biomes have water and bunkers behind the greens, but there's virtually no
trees or other hazards to punish going long on a green."

### The census agreed, and it was worse than "virtually"

Before writing anything, 2,250 generated holes (10 worlds × 25 seeds × 9 holes, wildness 0.6) were
measured for hazard material in the arc BEYOND the green (within 45 yards, on the far side of the pin):

| world | holes with something long | avg blobs | **avg TREES** |
|---|---|---|---|
| verdant-station | 76% | 1.36 | **0.08** |
| dust-belt | 70% | 1.10 | **0.00** |
| ice-ring | 72% | 1.20 | **0.04** |
| spore-jungle | 68% | 1.11 | **0.11** |
| earth-links | 71% | 1.17 | **0.00** |

Every one of those blobs is *incidental* — a greenside pot or ring blob that happened to draw an angle
past the pin. No pass in the generator had ever placed anything behind a green on purpose. Trees behind a
green were effectively **zero**, on every world, including the two densest forests in the rotation.

That matters more than it sounds, because **long is the one miss the player fully controls.** A lateral
miss is a swing error; flying the green is a club choice. Leaving the back of the green undefended means
the game never charges for the decision it most wants the player to sweat, and it makes every approach a
free swing: aim at the flag, and if you catch it you're fine anyway.

### The pass

A dedicated back-arc pass (±~63° of straight-on-long, `BACKSTOP_ARC`), placing three things:

1. **A backstop STAND** on any world that grows cover — a lead blob plus 1–3 companions, so the back
   reads as a stand rather than one token tree. Big blobs mean tall canopies (`canopyHeight` scales with
   blob radius), so the recovery has to come out low and running instead of being flighted at the pin.
   Frequency scales with the world's own `treeDensity`, so the desert gets the odd snag and the spore
   jungle gets a wall — never a uniform grove pasted on every world.
2. **A back BUNKER** on the straight-long line — "long is dead", playing back to a green running away.
3. **A patch of the world's own DEEP ROUGH.** This is what defends a world that grows nothing: St
   Annette's is `treeDensity: 0` by design, and so are the void and the derelict. Falls back to `fescue`
   when a world's `deepRough` is itself a penalty kind (the tidal world's is `water`).

### Fairness — a backstop is the hazard class that sits closest to the target

- **Everything it places is NON-PENALTY.** Long costs a stroke, never a lost card. A penalty backstop is
  a difficulty cliff and the fastest route through the no-death-spiral bar.
- **It clears the green, the approach lane and the corridor.** Two details cost a debugging round each:
  the blob is tested at its **jittered bound** (`blobPoly` swells a vertex by up to 30%, so a
  nominal-radius test lets the fat side poke onto the putting surface), and the green test runs against
  the **polygon**, not a max-radius circle — a star green's long lobe makes a circular test reject almost
  the whole back arc. The first version also rejected on `polylineDist(centreline)`: the centreline
  *terminates at the green*, so every point behind the green read as "near the corridor" and the entire
  pass silently placed almost nothing (the census after writing it moved trees by 0.09/hole). Behind the
  green there is no corridor — only, sometimes, the run-off flare, which sand and rough may sit in (that
  IS the collection area) but a treeline may not.
- **Its own side stream** (`:backstop:`), so it perturbs zero main-`rng` draws: every earlier hazard,
  every later hole and every other world stay byte-identical (contract 1). The whole seeded suite passing
  unchanged is that guard.

### Balance: measured neutral, and that is the right answer

| | toPar/hole | blow-ups |
|---|---|---|
| before | 0.8962 | 9.44% |
| after | 0.8958 | 9.51% |

Effectively no movement, because the auto AI clubs to *reach* the green and rarely flies it — its misses
are lateral. So the backstop is a punish for the **human** miss, which is exactly what was asked for. It
is worth being explicit that this means the auto bars do not validate the feature's difficulty; the
census (79–95% of holes now defended long, ~0.8 tree blobs per hole on a parkland world, 0.00 on the
links) is the evidence that it landed, and eyes-on play is the evidence that it feels right.

### Found on the way, NOT fixed here

`lieAt` gives hazards precedence over features, and `clearGreenOfPenalty` only drops **penalty** blobs —
so a bunker/pot/deep-rough/fescue/tree blob overlapping the green turns that slice of the putting surface
into its own lie. Measured at **21.9% of holes** carrying at least one such blob (pre-existing, from other
passes; the backstop provably adds none). Logged as `GS-green-surface-bite` in IDEAS.md with the fix shape
and the open design question. It wants its own PR and its own balance re-measure.
