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
- **Interactive suggested club = GREEN COVERAGE (`suggestPlayerClub`, GS-mechanics #6).** The player's
  🎯 suggestion is NOT the auto `aiClub` (shortest-that-reaches, tuned for balance — leave it alone):
  green unreachable → longest usable club; reachable → the LONGEST club whose spread still reaches the
  green's FRONT (`carryLow ≤ distToFront` via `greenDepth`), so the whole green stays in the landing
  window (overshoot allowed, never short). Uses the same `shotSpread` the cone draws, so it reads true.
- **Driver on Deck (`usableBag`, GS-mechanics #11).** The driver (`id 'D'`) is TEE-ONLY by default
  (`PlayerLoadout.driverDeck` level 0); a 4-tier shop ladder (`DRIVER_DECK` table, prereq-gated cards)
  unlocks it off the deck with a shrinking distance penalty + spray surcharge + widening allowed lies.
  The rule lives in ONE place — `usableBag(bag, lie, level)` removes the driver when locked or returns
  a reduced-carry copy when unlocked (so club-selection AND distance are right together) — and is
  applied by BOTH the auto sim (`playHole`/`PlayHoleOptions.driverDeck`) and the interactive player
  (`shotView`/`previewShot`/`takeShot`/club cycle), so auto≡playHole stays byte-for-byte and the
  off-deck driver reads true in the cone. `driverDeckSprayMult` adds the spray surcharge. CRITICAL:
  level 0 means the AUTO sim also can't driver off the deck (it clubs down to a wood) — a deliberate
  rule change that shifted the seeded balance; it was re-validated against the no-death-spiral bar.
- **Out of bounds = stroke-and-distance, and now VISIBLE (GS-13).** `playBounds`/`inBounds` derive a
  generous hole-sized box around all terrain (margin `clamp(span*0.25, 40, 90)` — the cap stops a long
  par-5 flinging the boundary miles out); a shot resting beyond it is +1 and replays from the shot's
  origin. Only genuinely wild shots trigger it. The box is DRAWN as a faint dashed boundary ringed
  with white red-capped OB stakes (`obStakes`/`playBoundsCorners`, render-only) in both renderers, and
  added to the `holeProjector` `extra` fit so the edge is on-screen to aim away from. GOTCHA: the box
  doubles as the OB *trigger*, so tightening the margin to make the hole bigger on screen directly
  raises the OB rate — a `64`-cap was tried and REVERTED (tipped `toPar/hole` to 1.03, over the bar).
  Both renderers fit the ball into frame too, so a wild shot is seen flying out, not clipped.
- **Blow-ups are absorbed, not eliminated:** at max wildness rare disaster holes still happen;
  Stableford caps them at 0 points so they don't wreck a run (that's *why* Stableford is the
  headline metric). Tests assert no *systemic* death-spiral (sane average, <5% blow-ups), not a
  hard per-hole cap. Tightening the short-game AI to shrink the tail is GS-4.

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

## Putting (auto vs manual; legendary auto-putt)
- **`onePutt` is the single putt model**; `puttOut`/`puttOutFrom` step it (auto), `takePutt`
  strokes ONE (manual). A `PuttSkill` (make%/lag) tunes it — base 0.85, the Auto-Caddie
  perk 0.92/tighter. Manual stepping reproduces auto putt-out byte-for-byte at a fixed seed
  (same rng order) — `tests/putting.test.ts` guards this.
- **Auto-putt is a UiState toggle** (`autoPutt`, default ON). `takeShot(…, autoPutt)` resolves
  the green automatically when on; otherwise it leaves the ball on the green and the UI shows
  the manual putt loop (`awaitingPutt` → `putt` action). The toggle is per-session (not saved).
- **Legendary `auto-caddie`** sets `loadout.autoPutt` (persisted via perks) AND grants the
  better `puttSkillOf` — so it both automates and *improves* putting (worth a legendary).
  Owning it locks the toggle ON. Design intent: later, flip the DEFAULT to manual so the
  perk becomes the real unlock; the toggle is the interim control.

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
- **Feel tunables read from `window._gsFeel`** (the escape-hatch rule) so loft/shake/trail/timing
  A/B live without touching the sim. Canvas feel can't be unit-tested — say "needs eyes-on play".
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
  (centre on a point — the ball) + `viewRadius` (course yards, biased so the ball sits low and you
  see ahead) instead of fitting the whole hole. The decision map zooms to the contemplated shot's
  reach (`spray.carryHigh × 0.62`) so a short approach zooms in and an unreachable green legitimately
  sits off-screen; the play-view animation uses the same focus + an eased follow-cam (rebuilt per
  frame) so it tracks the ball and matches the decision map's zoom (no jump — also closed the
  decision↔animation projector mismatch). `Projector.unproject` is the inverse (screen→course) that
  powers tap/drag aiming. The spray cone is drawn as a true ARC SECTOR (curved near/far edges at
  `carryLow`/`carryHigh`, swept ±`z·angleSd`) with min/max carry labels, matching the angular physics.

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
- **Play-loop UX (GS-mechanics #1/#2/#3).** A per-hole **briefing splash** (`holeSplash` reducer flag,
  cleared by `startHole` or defensively by `shot`) shows wind/hazards/conditions + a layout map before
  the first shot — render-only, the `shot` action is never blocked so the headless flow/tests are
  intact. The **shot-result popup** (a settle-delayed modal card + Continue after each non-terminal
  shot) and its timer are an `app.ts` VIEW effect (module vars, cleared by any dispatch), NOT reducer
  state — only `holeSplash` is reducer state. **Free-aim** (`ShotDecision.target`, GS-mechanics #10):
  tap/drag the map sets a course-space target (overrides attack/safe), unprojected from the pointer
  via a reconstructed decision projector and clamped to the longest club's reach; pointer move/up
  listen on `window` so a drag survives the per-frame re-render. **Mobile layout**: a responsive
  `<style>` block in `index.html` (`.gs-play/.gs-map/.gs-controls/.gs-hitbar`) keeps the map big and
  pins the Hit/Putt action bar to the viewport bottom so it never needs scrolling.

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
