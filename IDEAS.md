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

## Gameplay-loop review (2026-06-28 — `reports/gameplay-loop-review-2026-06-28.md`)
A roguelike-designer pass over the whole loop. Verdict: AAA "verb" (swing/flight/courses/caddies),
thin roguelike "sentence." The structural gaps were closed in one PR (the "full auto" build below);
none touched the fairness/no-death-spiral bars (new systems live on the economy/node/scoring side).

**SHIPPED (PR #82 — the roguelike loop overhaul):**
- **GS-boss / GS-voyage — Arcs with bosses + a WIN condition. SHIPPED.** New winnable headline format
  "The Voyage": three arcs, each two ordinary stops then a boss; clearing the final Galactic Major wins
  the run (`EndReason 'won'`, victory screen, champion shard bonus). Bounded/plateauing difficulty
  (`cutMult`/`maxJump`), boss `cutBonus`, the **harder-path (elite)** route flag + boss-ahead previews.
  Auto reach-AI wins ~7.5% no-meta → ~40% maxed; flat/ladder stay endless. `tests/voyage.test.ts`.
- **GS-scramble — Co-op showdown bosses. SHIPPED.** The Arc-II + final bosses are best-ball scrambles:
  an unchosen golfer partners you, hits a second ball each shot, the team keeps the better. Lifts a boss
  course ~17.9 → ~21.7 mean SF. Pure `pickBetterExec`; byte-for-byte off; auto≡interactive. `tests/scramble.test.ts`.
- **GS-variation — Multi-biome split stops + varied sizes. SHIPPED.** Stops vary 6/7/9; three mid-arc
  stops CROSS TWO WORLDS (front theme + a distinct back theme, stitched, per-hole biome/theme). Each half
  goes through the normal validators → provably fair. `tests/variation.test.ts`.
- **GS-ascension — Difficulty ladder. SHIPPED.** Win a voyage to unlock the next of 8 Ascension tiers
  (flat per-stop cut + leaner purse). Persisted in **save v4** (v3→v4 migration). `tests/ascension.test.ts`.
- **GS-synergy / GS-curses / GS-shop-reroll — SHIPPED.** Trigger relics (Birdie Hunter / Eagle Eye /
  Comeback Kid — economy payouts that compound with credit perks → snowball builds), the Glass Cannon
  CURSE (wider misses for +60% credits), and an escalating-cost shop **reroll**. `tests/synergy.test.ts`.

**Still open (next natural follow-ons):**
- **GS-100 / GS-competition — A FIELD of golfers, leaderboards & matchplay bosses. SHIPPED (the
  100th-PR feature, PRs #100–#104; `reports/competition-golfers-leaderboard-2026-06-28.md`, CLAUDE.md
  "Competition field…").** Supersedes GS-rival:
  not one rival but a 100–200-strong roster of styled AI golfers. A field of 20 competes each arc (shown
  on the arc intro); a live leaderboard + tightening cut line replaces the stop splash; constellation
  **champions** (one per constellation theme, named off its anchor star) dominate their home zones and
  rise to the top. The arc boss = the leaderboard leader (or #2 if you lead), fought as a **MATCHPLAY
  duel** on the actual hole — the boss has a unique avatar and hits their own real shots, with golf
  honour-system shot order (winner-of-last-hole tees off; farthest-from-pin plays through). The unchosen
  playable characters join the field and can boss. Field scoring is a deterministic statistical GHOST
  (cheap, tunable); only the boss plays real physics (reusing the scramble second-golfer machinery).
  Shipped in 5 PRs: (1) roster `golfers.ts`, (2) ghost `competition.ts`, (3) leaderboard UI + arc field
  card, (4) matchplay bosses on the hole, (5) live per-hole leaderboard chip + balance + docs.
  **Deferred follow-ons:** strict honour-gated, shot-by-shot boss ANIMATION on the map (the boss's ball
  flying, away-player-plays sequencing — today the boss ball is pre-computed and the duel revealed per
  hole); matchplay/boss cadence for the endless `flat` + `ladder` formats (they get the leaderboard race
  + cut today, bosses are voyage-only); the headless `simulateRun` playing the real duel (it keeps
  stroke-play for balance/tests).
- **GS-rival — Named AI rival / versus pulse. MERGED into GS-100** (the field IS the rival, at scale).
- **GS-encounters — Full branching node map.** The voyage is a fixed track today; a StS-style map of node
  KINDS (elite / driving-range buff / treasure / shop / boss) is the richer version. The format + boss
  layer is the foundation it builds on.
- **GS-contracts — Optional per-stop objectives.** "Eagle a hole → free relic", "4 GIR → +50% credits".
  Pure scoring read over `PlayedHole[]`; a card on the intro splash. (Relics already read the played holes.)
- **GS-meta-unlocks — Spend shards on CONTENT, not just stats.** Unlock new golfers/caddies/club sets/
  biomes/relics so the meta adds variety, not only power.
- **GS-risk-shards / GS-bag-cap — small.** Reward `cutDelta`/rarity survived in shards; a soft bag cap so
  club loot is a draft not pure accretion.

## Now / next (the slice is done — these are the natural follow-ons)

- **GS-clubs — Per-character starting bags + clubs as rewards. SHIPPED.** Each golfer now starts with
  a SPARSE, signature bag (8–10 clubs, not the full taxonomy) defined in `characters.ts` `STARTING_BAGS`
  — the signature long/mid clubs that read as their identity + a fair short-game ladder so they can
  actually score (a 5-club bag with one wedge and a 98-yd gap to the putter death-spirals at toPar ~2.2;
  measured). Clubs are then LOOT: a reward club is a `ShopItem` (`CLUB_ITEMS`, generated from a `CLUB_SETS`
  × `REWARD_CLUB_TYPES` table) whose `apply()` `equipClub`s it into the bag — replacing your club of that
  TYPE, or adding it (the bag holds one per type). Ownership rules (`offerableClubs`): a type you LACK is
  offered (fill a gap), a type you own is offered only as a HIGHER tier (upgrade) or a same-tier DIFFERENT
  set (side-grade) — never the one you hold. Starting clubs are the common `starter` set, so the offer
  never re-sells one you have (Larry sees no common Driver but a common 3-Wood; Bo the mirror). The `tour`
  rare tier is DISTANCE-club only (extra carry only helps on the woods — on a scoring club it overshoots
  the green, the power-cell lesson; scoring-club upgrades need a different stat/effect, deferred). Larry
  never sees hybrids (`loadout.noHybrids`); Driver Dan now gates on actually OWNING a driver. `clubOffer`
  draws the reward clubs into the shop alongside the perk offer (its own RNG stream); the bag is rebuilt
  from perks on resume (no save bump). `distanceClubBonus` carries the golfer (+14/−8) + Tour Bag (+6)
  flat bonus onto any reward distance club. Verified: roster clusters (~9 SF, 0% blow-ups), club coverage
  + distance upgrades raise the roster mean (`tests/club-rewards.test.ts`). **Deferred follow-ups:**
  (1) higher-tier / location-specific sets with game EFFECTS, not just carry (the Tarantula Network's
  Spyder putter etc. — one `CLUB_SETS` row each); (2) scoring-club upgrade tiers via per-club dispersion/
  shape (so a "tour wedge" is a real upgrade without overshoot); (3) wire reward-club acquisition into the
  cut-line/credit economy curve (today most runs end before the bag fills — the loop pays off late).

- **GS-caddy — The named-caddy card set. SHIPPED.** Caddies are a UNIQUE class of shop item
  (`ShopItem.caddy:'named'`, helpers `NAMED_CADDY_IDS`/`namedCaddyOwned`): hire ONE. They're random,
  rarity-weighted inclusions in the rotating offer (epic/legendary, so scarce); the moment you hire
  any named caddy, no named caddy appears again (`shopOffer` filter + `buy()` exclusivity). Generic
  caddy `'service'` perks (Caddie Lesson) gate behind owning a named caddy.
  Roster: **Penelope Putter** (the renamed `auto-caddie`, auto-putt), **Driver Dan** (`driverAnywhere`
  — driver from any lie at full stats; *replaces* the removed Driver-on-Deck ladder), **Dr Chipinski**
  (`chipInBoost` 0.33 — a +33% chip-in chance for PW-or-shorter shots resting within `CHIPIN_RANGE`
  8yds of the flag), **Space Ducks** (a `CaddyGuard` that laser-zaps duck-hooks + 50% of hooks back to
  the green mid-flight), **Convict Sheep** (the right-side mirror: boomerang the shanks + 50% of
  slices) and **Suggestible Sam** (`clubSuggest` — the only source of the 🎯 club suggestion; see
  below). The guards redirect a SAMPLED miss (they don't reshape the spray — the cone still shows the
  tails); `ShotResult.redirect` records the would-be miss so `playView` animates the projectile +
  ground-path kink (`render/caddyArt.ts`, eyes-on). All caddy rng is gated so the base sim stays
  byte-for-byte; threaded into both auto + interactive. `tests/caddies.test.ts` guards it.
- **GS-caddy-sam — Suggestible Sam: club suggestions become a caddy perk + a scoring edge. SHIPPED.**
  The interactive 🎯 Suggested button + the legend's suggested-club readout + the green-coverage default
  club were given to EVERY player for free; they now gate behind hiring **Suggestible Sam**
  (`suggestible-sam`, epic, named caddy → `loadout.clubSuggest`). The base flow shows no suggestion and
  defaults to a neutral club (putter on the green, else the longest usable) you read + cycle yourself —
  club selection is a real read again. To make him an actual UPGRADE (not just an un-nerf), Sam also
  grants **club confidence** (`loadout.confidenceMod` = `SAM_CONFIDENCE`, a green-zone `ShapeMod`):
  commit to the club he suggests and the spray cone visibly tightens (more great shots); override for a
  tactical placement and you forfeit it. Folded into the shape in BOTH `executeShot` and `shotSpread`
  ONLY when the played club is the suggested one, threaded identically through the auto sim
  (`PlayHoleOptions.confidence`) and the interactive driver, so auto≡interactive holds. It's a SHAPE
  change (no new rng), so non-Sam play is byte-for-byte unchanged and the gate makes an off-suggestion
  shot identical too; it only raises green %, so the death-spiral bar can't trip. Value proven by a
  follow-Sam headless harness (higher mean per-stop Stableford). `tests/caddies.test.ts` guards the
  gating, determinism, and the scoring lift.

- **GS-19 — Themes & fairways overhaul (per-zone identity + signature mechanics). SHIPPED.** The 5
  worlds now look and PLAY distinct. (1) **Per-archetype turf palettes** (`ARCHETYPE_TURF`) replace
  GS-17f's subtle hue-rotation — desert tan, frost teal, inferno scorched, void cosmic; verdant =
  the original `SHADES` byte-for-byte (themeless render unchanged). (2) **Void lost-rough**: off the
  fairway is the void (non-replay `voidlost` penalty), armed by wildness with widened island
  fairways — fair early, brutal late (toPar/hole 0.96 at max, the hardest world). (3) **Lava rivers**:
  a molten band crosses the fairway as a forced carry on ember par-4/5, exempt from
  `validateFairness` but proved carryable by `validateCrossings`, with a new carry-aware AI (lay up
  short / carry it) shared by auto + interactive (byte-for-byte). (4) **Zone splash card**: a
  procedural vector hero scene per world (`zoneHero.ts`) + real-space inspiration + difficulty pips +
  hazards/benefits, all data in `zones.ts`. Lava/void visuals (`styleLava`, void island glow). 338
  tests green; death-spiral bar holds across every biome.

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
  - **GS-17f — Per-theme turf/ground palette tints. SHIPPED (superseded by GS-19's explicit
    `ARCHETYPE_TURF` palettes — the hue-tint read too subtle).** A render-only HSL tint (`tintHex`/
    `Tint` in palette.ts) shifts the TURF (fairway/green/tee, gentle) and GROUND (rough/background/
    accents, full) toward the stop's world — verdant stays green, desert/inferno warm, frost cools,
    void goes violet — deepened by rarity + nudged per-theme. Gated on `themeId` so a themeless render
    is byte-identical (structural prim-count invariant guards it). Verified eyes-on.
  - **GS-17g — Sim Lab theme browser + theme-driven dispersion. SHIPPED.** The hub now imports
    `THEMES` and (via `lab.themeStudy`/`allThemeStudies`, real `resolveBiome`) browses all 47 themes
    with their resolved biome physics, and the dispersion panel's "World" selector fires a club under
    a theme's gravity. Guard's `IMPORTED_TABLES` extended with `THEMES` so the list can't fork.
    **GS-17 is now complete end to end.**

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
- **GS-mux — Mobile UX deep cuts. LARGELY SHIPPED** (`reports/mobile-ux-review-2026-06-28.md`).
  Done: immediate mobile hygiene (safe-area, touch targets, no h-scroll, Hit/Auto-finish mis-tap);
  **assetless WebAudio sound engine** (contact/putt/hole-out/cut/reward, fired at the true strike via
  a `playView.onImpact` hook); **haptic vocabulary**; **settings sheet** (sound/haptics/fast-shots/
  swing-gesture/left-handed/reduced-motion, localStorage `gs_settings`); **lie-awareness chip** on the
  decision bar (the per-shot-popup concern) + **Fast Shots** auto-advance; **one-row segmented aim** +
  **tap-to-aim-by-default** + **pinch-to-zoom**; **opt-in pull-back swing gesture**; **celebration
  bursts**; **run-momentum pip HUD**; **Daily Challenge** seed + **install nudge**; and two new caddies
  (**Sandy** = `lieRelief` escape specialist, **Mystic Mole** = manual-putt boost). DEFERRED (need real
  eyes-on tuning / larger scope): a **landscape/tablet layout**, **first-run coaching** coachmarks, a
  **putt drag-back gesture** (the pace meter still stands), surfacing **per-club/character personality**
  in the UI, and **multi-touch eyes-on** confirmation of pinch-zoom. Any new feel knob must add its
  test-hub control in the same PR (I4 rule) — GS-mux added none (dev knobs ride `_gsFeel`).

## Done
- **GS-bank — Push-your-luck cash-out. SHIPPED** (`reports/gameplay-loop-review-2026-06-28.md`).
  The classic roguelike "quit while ahead or risk it" decision was entirely absent: `bank()` was dead
  code (unreachable in the UI) and `shardsForRun` paid the same whether you BANKED or BUSTED — so
  pushing deeper was strictly correct and credits had no terminal value on a lost run. Fix (pure, no
  fairness/determinism impact): `cashOutShards(run)` converts unspent credits → shards
  (`CREDITS_PER_SHARD` 20) ONLY on a banked run (a cut forfeits them; the cut path is byte-for-byte
  unchanged); a "✦ Bank run & cash out (+N shards)" button on the travel screen (stop 1+) with the
  exact payout shown; the gameover screen reads green "quit while ahead" vs red "stranded at the cut".
  Now every travel screen is a real decision (spend credits for power to push, or hold to bank) and a
  fat stash is never wasted on a brick. `tests/bank.test.ts` guards the conversion, banked > busted,
  the unchanged cut path, and the reducer flow.
- **GS-dispersion-2 — Asymmetric spray-zone model + zone/distance upgrades.** Replaced the symmetric
  z-score spray with a `SprayShape` (green + 4 independent miss zones: duck-hook/shank red, hook/slice
  orange) that drives BOTH the physics sampling and the graphic, so the cone IS the landing
  distribution. Graphic: bands sized PROPORTIONAL to chance (a 2% red is ¼ an 8% orange; the old red
  was drawn wider than orange), a 0% zone vanishes, one-sided suppression reads lop-sided, green wedge
  keeps its width as its % climbs. Characters got per-club shape skew (Feather bakes in a right-fade,
  Huang-Woo balloons the LEFT zones on the long sticks). New upgrades: Anti-Hook Grip/Shank Guard
  (kill a red zone), Hook/Slice Corrector, Sweet-Spot Forging (more green), Draw Weighting (trade-off),
  Distance Control (raise min carry of big clubs), Wedge Touch (tighten the wedge window). All folded
  identically in auto + interactive; `tests/spray-shape.test.ts` guards redistribution, geometry,
  physics==graphic, and that the upgrades raise mean per-stop Stableford. See
  `reports/dispersion-graphic-upgrades-2026-06-27.md`.
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
  - **Driver on Deck** — *superseded by the Driver Dan caddy (GS-caddy)*. The 4-tier prereq-gated
    ladder was removed; the driver is tee-only by default and unlocked from any lie (full stats) by
    hiring Driver Dan, via the simplified shared `usableBag(bag, lie, driverAnywhere)` gate.
- **GS-routes — Inter-round rebalance + starmap. SHIPPED.** The travel screen's three lanes were
  functionally identical (all "+credits / +cut") with no real downside, so a green common often beat a
  rare. Fixed on three fronts: (1) FOUR distinct levers with genuine trade-offs — `creditMult`/`cutDelta`
  plus a new `creditToll` (credits paid UP FRONT on travel — the rich lanes bite) and `shardBonus`
  (permanent shards banked on travel, kept even on a bust — the meta/"banker" lane). Calm lanes are now
  SAFE-BUT-POOR (≤ ~1.05× pay) so safety has a price and a common is never a strictly-better rare.
  Rarity = STAKES (the reward ceiling rises monotonically common→legendary). (2) A per-arc SLOT draw
  (`drawArcRouteEvents`): arc 1 ≈ 2 commons + a wildcard; arc 2 ≈ common + crossover + rare(→epic→leg);
  arc 3 = 2 rares + epic (up to THREE legendaries — the deep/endless/ascension steady state, no
  guaranteed out). (3) ~26 recurring + 5 unique events (was ~15+5), each with an icon, lore line, and a
  functional `category` (calm/payout/toll/salvage). Plus a deterministic SVG **starmap**
  (`render/starmap.ts`): Earth → the travelled trail → YOU (the station-wagon spaceship) → three branch
  planets colour-keyed to the choice cards (rarity ring, glyph, ⚔/🔥 markers). Economy/cut/meta only →
  fairness + no-death-spiral validators untouched (all 522 tests green). `tests/events.test.ts` extended
  (lever design, rarity-stakes monotonicity, per-arc mix, the triple-legendary ceiling, toll/shard wiring,
  snapshot round-trip). Bumps `Run.bonusShards` + `RunSnapshot.bonusShards` (optional → back-compat).
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
