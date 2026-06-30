# Archived engineering log — rpg meta loop

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

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
- **Co-op SCRAMBLE mechanic (GS-scramble).** The base scramble fold: `scrambleOptsFor(run)` carries a
  partner's swing shape; `playHole` (auto) and `takeShot` (interactive auto-pick) each fire a SECOND
  `executeShot` (partner's shape, same club/target) and keep the better via `pickBetterExec` (holed >
  fewer penalties > closer to flag) for ONE team stroke. CRITICAL: the partner draw fires ONLY when
  scramble is armed, so a normal hole's rng stream is byte-for-byte unchanged and auto≡interactive holds
  (the player draw is first in both). This fold is now the engine underneath the **team-duel boss** below
  (and `scrambleOptsFor` is gated on the player being the scramble UNDERDOG, not on a bare boss flag).
- **The Arc-II boss is a TEAM DUEL — best-ball or scramble, random per run (GS-team-duel).** The old
  `boss.partner: 'scramble'` (a vs-the-CUT co-op stop) is replaced by a matchplay-style HEAD-TO-HEAD duel
  vs your rank-mirror opponent (`BossSpec.team: 'bestball' | 'scramble' | 'random'`, alongside `mode:
  'matchplay'`; `resolveTeamFormat(boss, seed)` fixes `'random'` per run). The HOOK is a fairness handicap:
  the LOWER-ranked side gets a PARTNER and the team format; the higher-ranked side plays SOLO — so the
  underdog can punch up at the boss and the favourite earns the harder solo task. `teamDuelSetupForRun(run)`
  resolves EVERYTHING (opponent via `matchOpponentForRun`, format, `underdogSide(playerPos, oppPos)` from the
  arc standings — opponent ranked higher ⇒ player gets the assist, else the boss does — partner golfer ids +
  shapes, and the boss `homeEdge`), pure and shared by the headless `playStop` and the UI reducer so they
  agree golfer-for-golfer. GOTCHA (intro copy): when `partnerSide === 'boss'` the BOSS is the underdog,
  so YOU are the favourite — the boss-intro line must read "You're the favourite — <opp> brings <partner>
  … you go it alone", NOT "<opp> outranks you" (the old text was backwards: it claimed the boss outranked
  you even though the boss got the partner BECAUSE it ranked lower). The result-screen line ("you went
  solo as the favourite") was already correct. The two formats:
  - **Scramble** — both hit every shot, play on from the BETTER ball. Interactively the PLAYER chooses:
    `resolveScrambleShot` resolves both balls (player draw then partner draw — the SAME rng order as the
    auto pick, so the stream is identical regardless of choice; only the SELECTION differs) and stashes them
    in `UiState.scrambleChoice`; a `scrambleChoiceOverlay` shows both balls (inline map + two `shotCardHTML`
    cards with lie + distance to pin) and the `chooseScrambleBall` action commits one via `commitScrambleBall`.
    The auto/watch path (`autoShotHole`, the `play` watch action) instead auto-keeps the better
    (`autoCommitScrambleBall` → `pickBetterExec`). Putts are NOT scrambled (matching the base fold), so the
    choice fires on full swings only.
  - **Best-ball** — both play their OWN ball the whole hole; the better hole SCORE counts (no per-shot
    choice). Interactively the player plays their ball normally; at `holeComplete` the partner's parallel
    ball is played on the SAME `:play` rng right after (so watch ≡ auto-finish) and `betterPlayedHole` takes
    the min for both the duel and the player's stop score.
  Engine: `match.ts` `playSideHole` (solo `playHole` / scramble fold / `bestBallHole`) builds a side's hole;
  `playTeamMatchStop` runs the hole-by-hole duel (headless + watch); `playBossSideStop` pre-plays the boss's
  team-scored side (revealed hole-by-hole like the solo matchplay boss). The boss side rides a SEPARATE
  `:boss` rng, so when the player plays SOLO their `:play` ball is byte-for-byte a non-boss stop. `finishStop`
  passes on the DUEL (`matchWon`), not a Stableford cut. Tune via the format mix, the partner shape, or the
  home edge. Tests: `tests/team-duel.test.ts` (format resolution, the scoring engine, the rank rule, the
  headless stop, and the interactive scramble-choice + best-ball reducer flows); `tests/scramble.test.ts`
  guards the base fold + `scrambleOptsFor` gating. NO new `_gs*`/URL hook (the choice is reducer state).
- **Boss EXTRAS (GS-team-duel): a home-zone edge + a pre-match scouting line.** (1) **Home edge** — a boss
  golfer on THEIR home constellation (`bossHasHomeEdge(id, themeId)`) plays sharper: `bossLoadout(id,
  homeEdge)` shaves `HOME_EDGE_HANDICAP` strokes and adds `HOME_EDGE_DISTANCE` yds (a "this is my turf"
  signature you can dodge by routing elsewhere). Threaded through `bossPlayOpts`/`playMatchStop`/the team
  helpers; defaults OFF (so existing matchplay seeds are byte-for-byte). (2) **Scouting** — the boss intro
  shows the opponent's style tagline (`opponentScouting` = the golfer's archetype `tagline`), who holds the
  partner edge, the resolved format, and a home-turf flag, so you read the matchup before teeing off.
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
  and drawn by the shared **`render/weather.ts`** layer (see *Weather / atmosphere layer* under Render).
  Touches NEITHER physics NOR generation rng, so fairness is untouched and a `'none'`/absent
  effect adds nothing. The starmap history nodes now wear each cleared world's **biome glyph** with a
  gentle twinkle (`StarmapStop.glyph`), the forward planets carry an **effect badge** (`effectIcon`), and
  the route card previews the destination biome + a **difficulty band** + the effect blurb — so the
  choice's impact reads at a glance. No new `_gs*`/URL hook (effects ride course meta; difficulty rides
  the existing event), so the test-hub guard needs nothing. Tests: `tests/journey-effects.test.ts`
  (difficulty clamp/monotonicity, effect mapping, that a harder lane raises `currentCourse` wildness +
  stamps the effect, stop-0/no-event unflavoured). The atmosphere RENDER was reworked into a shared
  animated screen-space module (`render/weather.ts`) — see *Weather / atmosphere layer* under Render.
- **The trade-market route pitches COLLIDABLE TENTS around the green — the one effect that's also a
  GAME MECHANIC (GS-tents, `src/sim/tents.ts`).** Every other `CourseEffect` is render-only; `tradeMarket`
  is the deliberate EXCEPTION. The old trade "camp" was a screen-space horizon caravan drawn in
  `weather.ts` (`drawTradeCamp`) — it floated over the controls on the decision map and hung in mid-air
  during the flight ("doesn't make sense"). REMOVED. Now the trade market is a ring of bright, collidable
  festival tents AROUND THE GREEN that a low/flat shot RICOCHETS off. `tradeTents(hole)` is a PURE function
  of the hole geometry (NO rng — like the OB box): an arc of `TENT_COUNT` tents at `greenR+TENT_R+6`,
  ridges TANGENT to the green (roof planes face radially in/out), deliberately leaving a clear approach
  window of ±`FRONT_GAP_DEG` on the tee-facing side (fairness — a normal approach is never blocked).
  COLLISION mirrors the tree knockdown: arc height decides it — `tentFlightHit` walks the SAME curved
  flight path the renderer draws and, if the ball crosses a tent below its roof there, knocks it down AT
  the tent and BOUNCES it along the reflected direction (`tentReflect` reflects the horizontal dir across
  the struck roof slope's outward normal — so a ball off the BACK of the green bounces back toward it, a
  side clip squirts away). A lofted wedge sails over and lands clean. NON-PENALTY always (a bounce only
  relocates the ball). `executeShot` runs the bounce AFTER the rng draws (pure geometry, no new draws —
  the single roll-energy draw is unchanged), and `rollOut` STOPS a ball that rolls into a tent (a straight
  stop → the roll-invariant `dist(rest,touchdown)===|roll|` holds). CRITICAL determinism: gated behind
  `opts.tradeTents` (off by default), so a base shot never builds tents and is byte-for-byte unchanged
  (the whole suite is the guard); threaded IDENTICALLY through the auto sim (`playerHoleOpts` →
  `playHole`, armed when `routeEffect(run.pendingEvent)==='tradeMarket'`) and the interactive driver
  (`takeShot`/`resolveScrambleShot`, the reducer passes `course.meta.effect==='tradeMarket'`), so
  auto≡interactive; the boss/partner inherit it via `match.ts` (like `rainbowRoad`) so a duel stays fair.
  RENDER: `styleTents` draws them in COURSE space in `buildScene` (gated `SceneOpts.tradeTents`, baked at
  the app boundary by `tentsActive()`), so they sit on the ground and track the follow-cam — the fix for
  the floating bug. On a hit the play view pops an **"Ow!"/"Watch it!"** speech bubble at the tent +
  `onTentHit` cues `sfx.bonk()`, a haptic, and a spoken yelp (`speakCaddy`). FAIRNESS proven by
  `tests/tents.test.ts` (placement off-green + clear front window, non-penalty, the bounce fires, and the
  no-death-spiral bar holds with tents armed across biomes at wildness 1). NO new `_gs*`/URL hook
  (content/effect-derived + a loadout/effect-baked render flag), so the test-hub guard needs nothing.
  Eyes-on the tents with `node scripts/tents-preview.mjs` (browser launch is blocked in some sandboxes).
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
- **Balanced 10-club starting bag + rare+ club rewards (GS-clubs-2, trimmed in GS-clubs-3; supersedes
  GS-clubs' sparse bags; `characters.ts` + `economy.ts`).** EVERYONE starts with the SAME balanced 10-club
  bag (`BALANCED_BAG`: D, 5W, 3H, 6i, 8i, PW, GW, SW, 60°, putter) — driver+putter bookends with a dense
  short-game ladder (PW→60° are ~12–18 yd apart) and the gaps loosening only up high where a long approach
  forgives a few yards. (GS-clubs-3 cut the over-stuffed taxonomy 27→21 — dropping 7W/9W/4i/AW/LW/58° — which
  took the Lob Wedge out of this bag, 11→10; see `docs/decisions/club-list.md` for the re-cut recipe.) This REPLACED the old sparse signature bags (`STARTING_BAGS`), which left big scoring-zone
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
  **Deferred:** scoring-club UPGRADES via a real stat — first step shipped (GS-fullsets, below): themed
  PUTTERS carry a rarity-scaled `puttBoost`, the first non-carry scoring-class upgrade. Still deferred:
  the same idea for irons/wedges (per-club dispersion/effect) and location-specific legendary sets with
  game effects (the Tarantula Network's Spyder putter — one row each).
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
- **A top MYTHIC cosmetic tier + a WARDROBE of hats & shirts (GS-cosmetics, `cosmetics.ts`/`apparel.ts`/
  `apparelArt.ts`).** Cosmetics now span a SUPERSET rarity — `CosmeticRarity = Rarity | 'mythic'` in
  `cosmetics.ts` (`COSMETIC_RARITY` col/weight/order, `cosmeticRarCol`/`isMythic`). CRITICAL: mythic is kept
  OUT of the sim's loot `Rarity` (clubs/perks/drops) — it would ripple into the rarity-weighted loot sampling +
  economy balance for no reason; it exists ONLY for ships + apparel, which never touch the sim. Three additions,
  all pure render/meta (no `_gs*`/URL hook, no balance/fairness implications):
  - **Apparel = browsable WARDROBE** (`APPAREL` rows: id/slot `hat|shirt`/set/rarity/cost/`look`). Unlike the
    rotating ship market, the wardrobe is the FULL catalogue (you pick the look you want); a piece is bought once
    with shards (`APPAREL_COST` per tier: common 15 … legendary 280, **mythic 500**) and equipped per slot
    (clicking the worn piece again takes it OFF — `equipApparel` toggles). Sets: the traditional **Astronaut** set
    (legendary Helmet + Space Suit) and the **Supernova** mythic set (glowing halo-Crown + nebula Suit, 500 each —
    the "super cool" pair); plus standalone basics (cap/bucket/visor/tophat/gold-crown, polo/striped/jersey).
    `equippedSet(hat, shirt)` flags a completed multi-piece set. Hats render as 7 canvas/SVG SHAPES (cap/bucket/
    visor/tophat/crown/helmet/halo), shirts as 5 (polo/striped/jersey/spacesuit/cosmic).
  - **The golfer WEARS what you buy.** `GolferLook` (playView) gained `hat?`/`shirtStyle?: ApparelLook`; the
    canvas `drawGolfer` draws the hat shape (replacing the default cap) + the shirt colour/glow/spacesuit chest
    panel, and `app.ts golferLook()` layers the equipped hat/shirt over the character's base style. The wardrobe
    SVG (`apparelArt.ts`: `apparelCardSVG` icons + `golferPreviewSVG` mannequin) mirrors the SAME shapes so the
    card matches the on-course look.
  - **The MYTHIC vehicle — the Mothership** (`ufo-mothership`, rarity mythic, **1,000 shards**). A new ship
    `look.kind: 'ufo'` in `shipArt.ts`: a classic flying-saucer dome + a ring of FLASHING lights + SPINNING
    landing-gear wheels (animateTransform) + a waving "Hole 19" pennant on a flagpole. The ship `marketOffer` is
    now RARITY-WEIGHTED (`COSMETIC_RARITY.weight`), so the mythic UFO is genuinely the scarcest draw ("rarer than
    the others") yet still obtainable.
  Save **v7** (`ownedApparel`/`equippedHat`/`equippedShirt`, v6→v7 migration seeds an empty wardrobe; equipped
  ids backfill to undefined if not owned). Ship `rarity` widened to `CosmeticRarity` (`TIER_COST.mythic = 1000`).
  Reducer actions `buyApparel`/`equipApparel`; a Wardrobe section in the Trade Market with a live golfer preview +
  set-complete badge. Eyes-on via `scripts/cosmetics-preview.mjs` (browser launch is blocked in some sandboxes → it
  also writes a standalone HTML; all 24 cosmetic SVGs are validated well-formed). Tests: `tests/apparel.test.ts`
  (catalogue/tiers/sets/buy-gate), `tests/ships.test.ts` (mythic UFO + weighted scarcity), `tests/save.test.ts`
  (v7), `tests/ui.test.ts` (buy auto-wears, equip toggle, guards).
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


## Default-bag tiers — the deep-Ascension Shard sink (GS-bag-tiers)

`bag.ts` adds a third thing Star Shards buy (after ships + apparel): a permanent **default-bag tier**
that re-outfits *every* golfer's starting bag in a higher loot rarity, to help survive the deep
Ascension ladder. It is deliberately **not** a new engine path — a bag tier is the existing themed
reward-set machinery (`economy.CLUB_SETS` Planet/Phoenix/Solar) pointed at the *default* bag instead of
a single bought club:

- **The progression ladder is the point.** Clearing an Ascension gate unlocks the tier that makes the
  *next* gate feasible: clear **A2** → the rare **Planet** bag (500 shards) → it helps you clear **A6**
  → the epic **Phoenix Flames** bag (2,000) → helps you clear **A11** → the legendary **Solar Storm**
  bag (10,000), the apex flex. The unlock is gated on the persisted `maxAscension` (a won voyage at gate
  N bumps it to N+1), so "cleared A2" ⟺ `maxAscension ≥ 3`; the three gates are `≥ 3 / 7 / 12`.
  `ASCENSION_MAX` was raised `8 → 15` so A11 is selectable+clearable at all.
- **`applyBagTier` re-stamps, it doesn't special-case.** Each default club is *rebuilt from its base
  type* via `buildRewardClub`: distance clubs (woods, `≥185 yd`) take the tier's distance set and gain
  its carry bonus (folding in the golfer's own `distanceClubBonus`, so Larry's upgraded driver is still
  a Larry driver); scoring clubs keep base carry (the power-cell overshoot lesson); the putter folds in
  the set's `puttBoost` make-window. So a bought tier is byte-identical to having outfitted the whole bag
  from the Pro Shop — and because `equippedGearTheme` already reads the bag's rarest themed set, the
  on-course golfer **swings the themed gear** with no extra wiring. It's a strict scoring upgrade (more
  reach + steadier putter, never extra carry on a scoring club), so it can't trip the no-death-spiral bar.
- **Baked at run start, off by default.** The tier rides `startRun`/`resumeRun` (a `bagTier` param on
  `startingLoadoutFor`, applied *last* so it reads the final `distanceClubBonus`), persisted on the run +
  snapshot (save **v8**) like Ascension. `'common'` is a no-op that returns the loadout untouched, so the
  whole determinism contract holds (zero rng draws, no stream reorder) and every existing seeded test is
  byte-identical — the bag build is pure, so changing carries only moves *outcomes*, not draw order.
- **The Pro-Shop floor.** Once your default bag is rare/epic/legendary, dangling *lower*-rarity clubs is
  noise, so `offerableClubs` filters by `loadout.bagTier` as a rarity floor (a purple bag sees only
  purple+ clubs). `'common'` is rank 0 → filters nothing.
- **Graphics.** `render/itemArt.ts drawGolfBag(tint, tier)` is a self-contained, blingier-per-tier golf
  bag (more clubs, brighter rim, themed emblem, a gold corona + star at legendary), tinted by the set
  theme. Shown on the Trade-Market bag-set cards, the Pro-Shop bag-inventory header, and the victory page
  (a "new bag unlocked!" notice fires when you clear A2/A6/A11). Pure SVG, no rng.
- **No new hook.** This is content + sim + save + view — no `window._gs*` flag and no `?param`, so the
  test-hub sync guard is untouched. `tests/bag.test.ts` covers the table/gates, `applyBagTier` carries +
  rarities + putt-boost, the common no-op determinism, snapshot/resume round-trip, the offer floor, and
  the reducer's `buyBagTier` gating.

## Ascension victory club unlocks — the per-character collection loop (GS-ascension-clubs)

Winning a voyage now *grows the golfer you played with*: it permanently unlocks one new random club for
that **character's** starting bag (`club-unlock.ts`). It celebrates the win and gives each character its
own long-tail loop — win again with Feather Fade and her bag keeps filling out, run after run. This is a
sibling of the bag tiers above (both are permanent starting-bag progression baked at run start), but the
axis is orthogonal: bag tiers raise the *rarity* of every golfer's bag at once; club unlocks add *more
clubs* to *one* golfer's bag.

- **Every won voyage, not just a new gate.** The reward fires on any `endedReason === 'won'` (the
  literal "clear a run with this golfer" reading), independent of the Ascension tier — distinct from the
  bag-tier gates, which key off `maxAscension` bumps. A0 counts: it's still a win. (Ascension wins are
  genuinely rare, so this is a meaningful per-clear prize, not a faucet.)
- **Character-specific, stored as TYPES.** The save (**v9**, `unlockedClubsByCharacter: characterId →
  club type ids[]`) holds only the club *type* per golfer, never a baked rarity. At run start the unlocked
  types are added to the bag as plain `starter` clubs (with the loadout's `distanceClubBonus` folded in,
  so Larry's unlocked woods stay long) and then `applyBagTier` re-stamps them to the *current* tier with
  the rest of the bag — so an unlocked club always matches the live bag rarity and upgrades for free if
  you later buy a higher bag tier. "Same rarity as the starting bag" falls out of this for free.
- **The eligible pool** (`unlockableClubTypes`) is the full `CLUBS` taxonomy minus what the golfer
  already carries (signature bag + already-unlocked), minus the universal putter, minus any type the
  golfer refuses (Larry/hybrids). The pick is a seeded `Rng(`${seed}:ascension-club:${ownedCount}`)` draw
  — deterministic, and the `ownedCount` salt decorrelates repeated wins on one seed.
- **Full bag → Shard consolation.** Once a golfer carries every unlockable club the pool is empty, so the
  win pays Star Shards instead, scaled to the bag rarity (the value of "a club at that tier"):
  `FULL_BAG_SHARD_BONUS` = 15 common / 25 rare / 45 epic / 70 legendary.
- **Baked at run start, off by default.** Threaded through `startingLoadoutFor`/`startRun`/`resumeRun`
  (an `unlockedClubs` param + a `Run.unlockedClubs`/snapshot field, stable for the run since unlocks only
  grow at a win — which *ends* the run). An empty list is the `addUnlockedClubs` no-op fast path, so a
  golfer with no unlocks is byte-for-byte the old loadout — the determinism contract holds (the whole
  seeded suite stayed green). Adding coverage clubs is the same machinery `club-rewards.test` already
  proves is fairness-safe (it never lowers roster mean Stableford), so it can't trip the death-spiral bar.
- **One source of truth for the four run-end sites.** The reducer's `runEndUpdates(state, run)` (exported
  for tests) computes every end-of-run delta — banked shards, the Trade-Market reseed, the Ascension tier
  unlock, and the won-voyage club/Shard reward — so the auto/interactive × ordinary/matchplay end sites
  (and `bank`) all reward a win identically. The victory page shows a "new club unlocked!" notice (or the
  Shard-bonus notice when the bag is full), beside the existing Ascension + bag-tier notices.
- **No new hook.** Content + sim + save + view — no `window._gs*` flag and no `?param`, so the test-hub
  sync guard is untouched. `tests/club-unlock.test.ts` covers the pool rules, the seeded reward roll, the
  full-bag consolation, the bag-grow/restamp/distance-bonus at each tier, snapshot/resume round-trip, and
  the reducer wiring (win → club, full bag → shards, cut → nothing).
