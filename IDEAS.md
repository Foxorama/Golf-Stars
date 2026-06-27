# Golf Stars — idea backlog

Living doc (per CLAUDE.md): scan, rerank, merge, retire — not append-only. Stable IDs, never
reused. Shipped → Done (link PR); bad → Dropped (say why).

## Avenue decision (open — building to keep all three viable)
The big open question is what wraps the golf. Three avenues, NOT mutually exclusive:
1. **Full top-down RPG** ("play golf to save the galaxy") — overworld/narrative shell *around* a
   validated golf loop. Biggest divergence; **deferred** until the golf + run shape are chosen
   (it wraps the loop, doesn't replace it).
2. **Roguelite** (the `flat` format) — current.
3. **Escalating ladder** (the `ladder` format) — 3 par-3s → 6 → 9 → 18. Shipped as a selectable
   run format (GS-9) so 2 vs 3 can be *played*, not guessed.
Everything below serves whichever avenue wins.

## Now / next (the slice is done — these are the natural follow-ons)

- **GS-17 — Star-travel themes (constellation/galaxy theming + arcs).** Foundation SHIPPED
  (`src/sim/course/themes.ts`): golf-finder's night-sky catalogue (`data/night-sky-cards.json`) is
  curated into a theme table — each constellation/deep-sky/galaxy is a stop theme bundling a biome
  archetype + rarity + arc. Arcs keyed by star count (≤5 / 6–7 / 8+ → 9/10/9); deep-sky/galaxy gated
  by rarity. `currentCourse` now generates from the stop's theme. See
  `reports/star-travel-theming-2026-06-26.md`. **Remaining slices:**
  - **GS-17b — Rarity-tiered, theme-flavoured biomes. SHIPPED.** `resolveBiome(theme)` composes the
    archetype baseline × per-theme `BiomeFlavour` × rarity intensity (`RARITY_INTENSITY`), every
    field clamped fair. Each constellation/galaxy now PLAYS its character (Scorpius's hooking sting,
    Sagittarius's black-hole gravity, the galactic-core grandeur) and rarer reads wilder. Generator
    takes a resolved `biomeRow`; biome id stays the archetype so the 5-key palette holds (per-theme
    VISUALS are GS-17e). No-death-spiral re-proved across every theme at max wildness.
  - **GS-17c — Event split. SHIPPED.** Route events re-themed from the catalogue and split:
    `ROUTE_EVENTS` (recurring backbone — showers/moon/flares/aurora) are `minArc`-tiered so they
    ACCENT the arcs (calm early, brutal late); `UNIQUE_EVENTS` (one-off eclipses/Apophis) are deep-arc,
    high-stakes, and fire ≤1 per run (`run.firedEventIds`, round-tripped in the snapshot). `eventPool`
    tiers + excludes fired uniques; still economy/cut-only (fairness untouched).
  - **GS-17e — Render the constellation. SHIPPED.** The stop's actual stick figure (catalogue
    `stars`+`lines`, extracted to `src/render/constellations.ts` by `scripts/gen-constellations.mjs`)
    now hangs in the sky via `buildScene` (`SceneOpts.themeId`), rarity-tinted, in both renderers.
    Byte-stable when no theme is passed (render tests untouched); deep-sky/galaxy themes (no figure)
    fall back to the ambient starfield. Still open: wire the theme into the Sim Lab + Demo hub, and
    per-theme palette tints beyond the figure.
  - **GS-17d — Themed upgrades. SHIPPED.** The outfitter is biased toward on-theme gear: each
    archetype favours a category (`ARCHETYPE_AFFINITY` → `ITEM_TAGS`) — inferno→distance, void→
    control/skill, frost→control/putting, desert→control, verdant→economy/skill — so the shop reads
    on-theme for where you are. A soft weight (`ITEM_AFFINITY_BOOST`), never a filter; offer stays
    deterministic + distinct; item effects/balance untouched (shop invariants hold).
  - **GS-17f — Per-theme turf/ground palette tints. SHIPPED.** A render-only HSL tint (`tintHex`/
    `Tint` in palette.ts) shifts the TURF (fairway/green/tee, gentle) and GROUND (rough/background/
    accents, full) toward the stop's world — verdant stays green, desert/inferno warm, frost cools,
    void goes violet — deepened by rarity + nudged per-theme. Gated on `themeId` so a themeless render
    is byte-identical (structural prim-count invariant guards it). Verified eyes-on.
  - **GS-17 follow-on (small):** wire the theme into the Sim Lab + Demo hub (the only remaining piece).

- **GS-4b — Short-game AI + green slope (the rest of GS-4).** Putt *visuals* + a putt-path model
  shipped (PR #7). Still open: a smarter recovery/short game to shrink the rare max-wildness blow-up
  tail, and green slope/break once greens carry contour data. NOTE: a naive "club for nearest carry
  on reachable shots" was tried and REVERTED — it worsened high-wildness scoring and didn't shrink
  the tail (the cut is chaotic; perturbing club choice just reshuffles the RNG stream). The tail is
  Stableford-absorbed by design, so this is polish, not a blocker. Keep it pure + seeded.

## Later

- **GS-5b — Flux biome/boss art.** The card system + art hook shipped (PR #9); cards fall back to
  a rarity gradient + hole thumbnail. Generating the actual Flux art needs the image-gen tooling
  (absent in the coding session) — see `reports/art-pipeline-2026-06-24.md` for the hook + prompt
  log. Pass `artUrl` to `courseCardHTML` once images exist.
- **GS-7 — Daily challenge seed.** RNG already accepts string seeds (`hashSeed`); a daily is just
  `new Rng('daily-YYYY-MM-DD')`.
- **GS-16b — Finish I2 parity on the hub.** Each hook should have BOTH a URL form and a live form.
  Remaining: a URL form for the feel flags (`?feel=`/`?spray=` seeding `window._gs*` at first paint)
  and a live no-reload helper for seed/intro (drive the iframe without a full reload). Small; the
  hub + auto-discovering guard + five hooks already shipped in GS-16.

## Done
- **GS-16 — Test & demo hub + Sim Lab + auto-discovering CI sync-guard.** A second built page
  (`test.html` → `src/test/hub.ts`, served at `dist/test.html` beside the game) to demo features and
  stress-test the sim. Two faces: a **Demo** that drives the REAL game in an iframe via its public
  hooks (`?seed=`, `?intro=`, and live `window._gsFeel`/`_gsIntro`/`_gsSpray`/`_gsArt` flags on the
  same-origin frame — zero re-implemented logic), and a **Sim Lab** that imports the pure sim for the
  batch experiments the headless engine was built for. `src/test/lab.ts` (pure, DOM-free, tested in
  `tests/lab.test.ts`): `dispersionStudy()` fires a club N times through the real `resolveShot`
  ("hit the driver 1000×" → scatter + carry histogram + σ/percentiles, reading the per-club
  wildness model true); `buildLoadout()` composes a real loadout from handicap + meta upgrades +
  shop perks; `scoreHarness()` runs N seeded `simulateRun`s reporting **mean per-stop Stableford**
  (the balance metric). `src/test/charts.ts` is render-only Canvas2D. Tiny sim addition: `meta` on
  `RunStrategy`/`simulateRun` so the permanent layer is headlessly simulatable (backward-compatible).
  Build: singlefile forbids multi-input, so `npm run build` runs vite twice (game, then `VITE_HUB=1`
  appending the hub) — `pages.yml` unchanged. The standard + portable guard template live in
  `standards/`; `tests/test-hub.test.ts` is the live CI sync-guard that **auto-discovers** hooks from
  the app source (every `window._gs*` flag + `?param`) and asserts the hub drives exactly that set
  both ways — so a new hook reds the build (proven when this branch merged main's new `_gsArt` flag).
  I4 process is the `keep-test-hub-in-sync` skill + a CLAUDE.md section. Verified eyes-on (Playwright).
  I2 (both forms per hook) is the one partial invariant → GS-16b.
- **GS-15 — Play-loop UX + mechanics overhaul** (branch `claude/golf-ui-mechanics-x3s54o`). A batch
  of feel/fairness/UX fixes from eyes-on mobile play, staged on one branch:
  - **Angular dispersion** — random spray is now an ANGLE about the bearing, so the spray cone is a
    true ARC SECTOR and a wide miss never exceeds max distance (the "square box" bug). `ShotSpread.
    angleSd` is the shared truth; rng draw order preserved (auto≡interactive). Rough 10% / bunker 50%
    lie penalties.
  - **Zoom + follow-cam map** — projector `focus`/`viewRadius`/`unproject`; decision map zooms to the
    shot's reach (far green off-screen when unreachable); animation follows the ball; min/max carry
    labels on the spray arc.
  - **Green-coverage suggested club** (`suggestPlayerClub`) for the interactive player; auto `aiClub`
    untouched. **Item rarity** fixed (Power Cell common→rare).
  - **Hole briefing splash** (wind/hazards/conditions + map), **per-shot result popup** (settle-delayed
    Continue), **mobile no-scroll layout** (sticky Hit bar).
  - **Free-aim** — tap/drag the map to aim within max distance (`ShotDecision.target`).
  - **Driver on Deck** — 4-tier prereq-gated shop ladder unlocking the driver off the deck (tee-only by
    default), via one shared `usableBag` gate applied by both the auto sim and the player.
- **GS-14 — Route events (risk/reward travel).** Travel was a non-decision — three lanes that
  differed only by distance. Now every onward route carries a themed **event** (`events.ts`,
  content-as-data) that tilts the stop you fly *into*: a `creditMult` (payout — the progression
  currency) and a `cutDelta` (the fail gate — the risk). Spread from **Calm Drift / Stellar
  Tailwind** (easier cut, modest pay) through **Trade Lane** (pure reward) to **Solar Flare /
  Pulsar Jackpot** (credits double, cut spikes +2/+3). The draw is seeded + rarity-weighted (rarer
  = scarcer & juicier) and **always guarantees a calm option** so a jump is never an all-or-nothing
  trap. Fairness-safe by construction: events touch ONLY economy/cut, never generation, so the
  no-death-spiral + fairness validators are untouched. `travel` stows the chosen event on
  `run.pendingEvent`; `finishStop` applies it via `effectiveCut` + the credit mult and then *clears*
  it (so a resume can't double-apply); `RunSnapshot.pendingEventId` round-trips it. Stop 0 (no jump)
  uses the neutral `DEFAULT_EVENT`, so every existing stop-0 test is byte-for-byte unchanged. Travel
  + intro screens render the event (rarity-tinted cards, adjusted cut shown honestly). New
  `tests/events.test.ts` (10) guards the spread, the calm-guarantee, determinism, the cut/credit
  application, snapshot round-trip, and that no-upgrade runs still terminate by the cut.
- **GS-13 — Cooler holes: treelines, fairway bunkers, visible out-of-bounds.** Holes now read
  like real golf. **Trees** are a new non-penalty LIE (`trees` in LIE_INFO: carry 0.6, dispersion
  1.7) — a sprayed ball ends up "in the woods" and punches out; fair & readable, never a stroke
  lost. They line the rough OUTSIDE the play corridor (only an offline shot finds them) and are
  drawn as canopy glyphs (not flat blobs) in both renderers. **Fairway sand bunkers** (`fairwayBunkers`
  per biome) bite the landing-zone edge — sand is non-penalty so they're always fair risk-reward.
  Both are content-as-data biome rows (`treeDensity`/`fairwayBunkers`): verdant is tree-lined, dust-belt
  is bunker-strewn, the void stays barren (crystals, no woods). **Out-of-bounds is now visible**: the
  existing stroke-and-distance box (margin capped so a long par-5 doesn't fling it miles out) is drawn
  as a faint dashed boundary line ringed with white, red-capped OB stakes (`obStakes`/`playBoundsCorners`)
  in both renderers, framed into view so you can see and aim away from the edge. `GENERATOR_VERSION` → 3.
  All gated by the fairness + no-death-spiral tests (a tighter OB margin was tried and REVERTED — it
  tipped toPar/hole over the 1.0 bar: more wild shots caught OB). New `tests/hazards.test.ts` guards the
  trees-stay-off-corridor, sand-is-fair, and OB-stake-on-boundary invariants; both renderers verified
  eyes-on. (branch `claude/golf-hazards-boundaries-8aud8s`)
- **GS-12 — Persistent meta-progression (Star Shards + Outpost).** Runs now leave a mark: each
  ended run awards **Star Shards** (`shardsForRun` = distance×3 + stops×2, floored at 1 so a brick
  still pays), banked across runs in **save v3**. The **Outpost** (a between-run screen off the
  title/gameover) spends shards on PERMANENT, leveled starting upgrades (`meta.ts`: Veteran Hands
  −2 hcp, Tour Bag +6yd, Steady Grip −4% spray, Deep Pockets +40 credits) at a geometric shard
  cost. `startRun(seed, fmt, meta)` bakes them into the start; perks rebuild OVER the meta base on
  resume (the run snapshot carries `meta`). Pure/data-driven; reducer flow + v2→v3 migration tested,
  and the open→buy loop verified in a real browser. Closes the "credits go dead, nothing persists"
  gap — now every run feeds the next. (branch `claude/golf-stars-improvements-m4ktof`)
- **GS-6 — Real pin within the green.** Each hole now generates a flag (`Hole.pin`) offset
  18–55% of the green radius from the centroid, via a SIDE rng keyed by hole index so existing
  course terrain is byte-for-byte unchanged. The flag is where the ball holes/putts (so a tucked
  pin = a longer putt) and the interactive *attack* target; the auto/percentage AI still aims at
  the fat of the green (centroid) — aiming at an off-centre flag spilled shots off the green under
  max-wildness spray (toPar/hole 1.21 vs the <1.0 fairness bar), so "safe = centre, attack = flag"
  is both better golf and fairer. Both renderers draw the flag at the pin. Validation rejects an
  off-green pin. Tested (`tests/pin.test.ts`); putting/roll/round assertions retargeted to the
  flag. (branch `claude/golf-stars-improvements-m4ktof`)
- **GS-11 — Deep shop / build progression.** The outfitter was 5 one-shot perks (dead after
  ~5 stops while the cut-line kept ramping). Now: **stackable upgrades** (Caddie Lesson −2 hcp,
  Fortune Chip +15% credits, Precision Chip −8% dispersion, Range Booster +8 yd/−3% spray) buyable
  repeatedly at a geometric cost ramp (`itemCost`, `STACK_COST_GROWTH`) up to a per-item cap — an
  endless credit sink and a build that scales into the difficulty. Plus a **seeded, rarity-weighted
  per-stop offer** (`shopOffer`, 4-of-N, deterministic from seed+stop, maxed items drop out) so the
  shop rotates and presents real choice. Pure/tested: stacking, cost ramp, offer determinism, and
  the "every upgrade improves (or for economy, doesn't hurt) mean per-stop Stableford" invariant.
  Perks are a multiset now (dupes in `perks[]`); save v2 unchanged (`loadoutFromPerks` folds them).
  (PR TBD — branch `claude/golf-stars-improvements-m4ktof`)
- **GS-10 — RPG shot model + interactive play.** Handicap stat + cards (reduce randomness /
  add distance / lower handicap), and shot-by-shot play: per shot you pick a club and Attack vs
  Safe, the outcome is handicap+RNG via the shared executeShot physics, putting auto-resolves.
  Auto-play kept as a watch/skip fallback. Bounce/roll-out + hole-out juice (chip-ins/aces).
  Pure driver tested (auto-play === AI); reducer flow tested. (PRs #18–#21)
- **GS-1 — Wildness & biome system.** Biomes as data, fantasy lies, fairness-by-construction,
  wind-reading sim. (PR #2)
- **GS-2 — RPG meta-loop (sim layer).** Run state machine, cut-line fail gate, credits + shop
  perks, save v2 with run snapshot/resume + v1→v2 migration. Headless + fully tested. (PR #3)
- **GS-3 — Canvas2D play view + ball flight.** Animated arc/shadow/trail/impact/screen-shake off
  `ShotLog[]`; shared pure projector with the SVG map; pure trajectory math tested. Feel needs
  eyes-on play. (PR #4)
- **GS-9 — Run formats.** Data-driven run shape (`sim/rpg/formats.ts`): `flat` roguelite (6-hole
  stops, reproduces the original exactly) and `ladder` escalating ascent (3 par-3s → 6 → 9 → 18),
  selectable on a new title screen. The lever to play Avenue 2 vs 3. (PR #8)
- **GS-5 — Course/item cards.** Rarity-tinted card layer (`render/cards.ts`): course-discovered
  cards on the intro screen, clickable shop item cards. Pure HTML builders, tested. Art hook
  (`artUrl`) ready; actual Flux art is GS-5b. (PR #9)
- **GS-8 — Interactive meta-loop UI.** Pure screen-flow reducer (`ui/game.ts`) over the run API:
  intro → play → result (animated + scorecard) → shop → travel → repeat → gameover. Save/resume
  via the v2 schema. Reducer fully tested through a playthrough; click-through feel needs eyes-on.
  (PR #5). Follow-on left open: smarter auto-pilot route choice for balancing.

## Dropped
- _none yet_
