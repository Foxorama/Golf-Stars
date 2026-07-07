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
    choice). Interactively the player plays their ball normally; the MOMENT the hole is done the reducer's
    `withBestBallPartner` plays the partner's parallel ball on the SAME `:play` rng (the identical draws
    `holeComplete` used to make — the stream order is player's full hole then partner's, exactly
    `bestBallHole`, so watch ≡ auto-finish byte-for-byte; `holeComplete` now consumes the stashed
    `match.partnerHoles[idx]`, with a defensive same-draws replay fallback). Resolving at done-time exists
    for the REVEAL: the end-of-hole screen (`bestBallRevealHTML`) shows the pair's two cards side by side —
    each ball's strokes + score name — with the counting one highlighted/badged (ties keep the player's),
    and the score banner / stop points / duel line on that screen are all computed off the KEPT team ball,
    matching what `holeComplete` records. The inverse rule mid-hole: a best-ball duel shows NO hole results
    until the flag — the matchplay HUD's "boss made N here" line and the decision map's boss `ghostShots`
    are both suppressed when `setup.format === 'bestball'` (they stay on for solo matchplay and scramble),
    so neither the partner's nor the other side's score is spoiled before the end-of-hole reveal.
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
- **Pro Shop rarity is VOYAGE-paced, and every item is a one-shot (GS-voyage-rarity / GS-proshop-variety).**
  Two fixes to the same complaint ("legendaries never show; you buy the same card five stops running").
  (1) *Rarity by stop, not distance.* The endless ramp (`rarityDepthBias`, keyed off galaxy distance,
  peaks at distance 18) never got near its deep end inside a bounded 9-stop voyage, so the last shop was
  stuck ~blue-heavy / 18% epic / 6% legendary. `shopOffer` now routes a **winnable** format through
  `voyageRarityBias(rarity, voyageShopProgress(stopIndex, stops))` (endless formats keep the distance
  ramp via `shopRarityBias`). The voyage curve is keyed off the STOP (the arc/boss pacing the player
  reads): shop 1 mostly GREEN + a BLUE; a small PURPLE **and** the first ORANGE open between boss 1 & 2
  (stops 2–4); a higher chance after boss 2, ending "halfish blue / halfish purple with a real (minority)
  legendary chance" at the final pre-boss shop (stop 7). Two knobs the single `b^order` couples away:
  `b` (eased) lerps the rare/epic base; a SEPARATE, later-opening `legTilt` gates the legendary tail so
  orange is shut in the opening shops, a taste mid-voyage, a genuine-but-bounded chance late. Commons
  stay flat (×1). It reweights WHICH item is drawn, never the rng draw COUNT → deterministic/resume-safe.
  (2) *One-shot variety, no stacks.* The catalogue no longer ships any `stackable` item — once bought,
  an item drops out of the offer, so every shop is fresh DISTINCT gear instead of one card re-bought. The
  build still scales via the many SIBLING items per axis (control/distance/economy/putting/short-game),
  each former stackable bumped to a worthwhile single value, plus new siblings that also give the epic/
  legendary tiers real gear (`mallet-putter`/`pinseeker-putter`, `pro-irons`/`flop-wedge`, `quantum-shafts`/
  `nova-driver`) — so a deep voyage actually has a legendary worth buying that ISN'T a named caddy. The
  `stackable`/`maxStacks`/`itemCost`-geometric plumbing is KEPT (dormant) so old saves with duplicate perk
  ids still fold each id in `loadoutFromPerks` and resolve their full stacked power on rebuild (no migration).
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
  rebalance fixes). Now pure levers give lanes DISTINCT, traded-off shapes: `creditToll`
  (credits paid UP FRONT in `travel`, floored at 0 — a genuine cost so the rich lanes bite) and, on a
  `salvage`-category lane, a **club find** (GS-journey-fx-3, below). Calm lanes are now SAFE-BUT-POOR (creditMult ≤
  ~1.05, or they charge a toll) so a common is never a strictly-better rare; rarity = STAKES (the
  reward CEILING rises monotonically common→legendary, and so does the risk). The chosen event rides
  `run.pendingEvent` (set by `travel`), applied by `finishStop` via `effectiveCut()` + the credit
  mult, then **cleared** there so a resume can't double-apply it (`RunSnapshot.pendingEventId`
  round-trips it). Stop 0 / no-event = the neutral `DEFAULT_EVENT`, so existing stop-0
  behaviour is byte-for-byte unchanged. CRITICAL: events touch ONLY economy/cut/meta, NEVER course
  generation — that's what keeps the fairness + no-death-spiral validators untouched. Keep it that
  way; a "wilder course" event would have to re-clear those bars.
- **Salvage lanes LOOT A CLUB, not a shard drip (GS-journey-fx-3, `salvage.ts` + `tests/salvage.test.ts`).**
  The old `shardBonus` lever banked +1…+8 permanent shards on a `salvage` lane — noise against a Trade
  Market priced 60…1000 shards, so the "reward" moved nothing and the lane was a dull pick. The rebrand:
  a salvage / debris / wreck / mining lane now SCAVENGES a club you don't already carry, equipped for the
  rest of the run. `routeClubFind(ev)` (in `effects.ts`, the single source read by both `travel` and the
  route card) returns the find rarity for `category==='salvage'` lanes only, floored at RARE (the shop's
  own floor — commons aren't offerable gear) else the lane's own grade, so an early common salvage lane is
  a genuine rare find and an epic/legendary lane loots epic/legendary. `salvageClubFind(loadout, rarity,
  seed)` picks from `offerableClubs` filtered to that rarity (the shop's own "a club you don't carry, or a
  genuine distance/putter upgrade, respecting golfer refusals + the bag-tier floor" filter), preferring a
  brand-NEW type over a same-type upgrade; an empty pool (bag already full at that tier) pays a rarity-scaled
  credit consolation so the lane never comes up empty. Applied in `travel`. THREE properties make it safe:
  (1) **resume-safe for free** — the find is a shop `CLUB_ITEM`, so `item.apply` records its perk id on the
  loadout and `loadoutFromPerks` re-equips it on resume; no new save field. (2) **determinism** — the pick
  runs on a PRIVATE `Rng` stream (`salvage:<seed>:<arrivingStop>:<eventId>`), never a shared sim/render
  stream, so attaching a find perturbs no existing draw order (the whole seeded suite stayed byte-identical).
  (3) **can't spiral** — paid at travel (touches neither generation nor the shot stream), and a found club
  only ever RAISES Stableford. The route card previews the EXACT club off the same stream, so it can't lie.
  Shards are a run-END reward now (`shardsForRun`: distance/win/bank); `run.bonusShards` moves only via
  endless milestones (GS-unending). No new `_gs*`/URL hook → the test-hub guard needs no new control.
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
  - **VERTICAL, tap-to-choose star-chart (GS-journey-vertical, `starmap.ts`/`app.ts`/`index.html`).**
    The horizontal two-panel widget above was a poor mobile fit (a wide scroll strip + a cramped right
    fan of tiny planets, a wall of three big route cards below it). Reworked into a mobile-first VERTICAL
    star-chart you climb: **Earth pinned at the BOTTOM**, the travelled trail winding UP to YOU, and the
    three branch planets fanned across the TOP. Now ONE responsive SVG (`viewBox 0 0 320 H`,
    `width:100%`) inside `.gs-journey--v` (a `max-height:64vh; overflow-y:auto` panel that scrolls
    internally only on long voyages, starting at the top where the choices are) — no more two flex
    siblings, no seam logic, no `journeyScroll`/`data-journey-scroll` DOM nudge (all deleted). GALAXY-EXACT
    is preserved but ROTATED: a world's X follows real DECLINATION (fixed window `dec +38..−80 → left..
    right`) and the VERTICAL gap to the previous world scales with real ANGULAR distance
    (`clamp(46 + greatCircleDeg·0.66, 58, 150)`), so a far-flung hop CLIMBS further. History draws
    newest-nearest-YOU (top) → oldest-nearest-Earth (bottom). **The three branch planets are TAP TARGETS**
    (`data-route-inspect="<routeId>"` on the SVG `<g>`, a pulsing halo + fat transparent hit-circle):
    tapping opens `routeInfoOverlay()` — a bottom-sheet (reusing `.gs-sheet`/`.gs-sheet-backdrop` chrome,
    accent bar `--rs-accent`) with the FULL jump detail (biome/world + difficulty + weather effect + the
    bet's levers + ⚔/🔥 markers) and a **Cancel / 🚀 Jump** pair. The old always-open route cards are
    GONE — the sheet is the single detail surface. `inspectRouteId` is view-only module state in `app.ts`
    (like `inspectGearId`/`settingsOpen`): toggled via the `[data-route-inspect]`/`[data-route]` handlers,
    force-cleared whenever `state.screen !== 'travel'` (route ids repeat 1..3 per stop, so a stale id
    would otherwise auto-reopen a sheet), ZERO reducer/save/rng impact — the reducer's existing
    `{ type:'route' }` action still commits the jump. No new `_gs*`/URL hook → the test-hub guard needs
    nothing. `tests/journey-map.test.ts` reworked for the vertical orientation (Earth + `.gs-journey--v` +
    per-choice `data-route-inspect` present, one node per stop, far-hop climbs further, determinism).
    Verified eyes-on (Playwright render of the top/scrolled-to-Earth chart + the info sheet).
  - **The chart is a LIVING cockpit view (GS-journey-alive, `starmap.ts`/`index.html`).** The flat
    glyph-discs became actual WORLDS: each destination is a lit-from-upper-left sphere (per-world
    `radialGradient` body + a terminator crescent + a pulsing specular glint + an atmosphere rim),
    carrying biome-specific surface art clipped to the body — gas cloud-bands, molten crust with pulsing
    ember cracks, icy polar caps, arid dune ribbons, lush drifting continents (`surfaceArt(family,…)`,
    keyed off a `family` field added to `BIOME_LOOK`). Stakes read BEFORE biome: a boss world wears an
    ominous breathing **red aura**, a harder path a warm **heat shimmer**, and the ⚔/🔥 markers pulse.
    Energy pulses stream UP each warp corridor toward its gate (`animateMotion` along the lane path,
    `keyPoints="1;0"`), a **comet** periodically flies the travelled trail from Earth up to YOU, Earth is
    a proper lit blue marble, YOU sits on a glowing **launch pad** (pulsing ring + thruster flicker +
    ascending sparks), and the sky itself gains seeded twinkles + the odd shooting star. All decoration
    is placed by a LOCAL seeded `mulberry32(hashSeed(opts.seed))` — NEVER `Math.random` — so the widget
    stays byte-stable (determinism test + a build-diff check confirm it). CSS adds a seamless slow
    star-drift (uniform 180px = one tile, nebulae pinned) gated behind `prefers-reduced-motion`, and a
    cockpit-window frame glow. No new `_gs*`/URL hook → the test-hub guard needs nothing. Verified
    eyes-on (Playwright renders of both the top and the scrolled-to-Earth view).
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
- **The three lanes are three DIFFERENT worlds, and the weather set widened with a wind hook
  (GS-journey-variety, `run.ts`/`effects.ts`/`themes.ts`/`render/weather.ts`).** Two complaints from
  play: the journey map "consistently does 2 or 3 of the same biome", and the space weather was
  "limited in type and effect on game" with weak course visuals. Three coupled fixes:
  1. **Lane-distinct biomes.** `routeTheme` gains an `avoid` set of archetypes; `routeOptions` threads
     the CURRENT stop's archetype plus each already-drawn lane's, so the three branch planets always
     land three distinct world archetypes and (pool permitting — every arc has ≥5, avoid is ≤3) never
     the world you're standing on. NOT a bounded retry loop: a colliding first draw is replaced by ONE
     rarity-weighted redraw over the arc pool FILTERED to permitted archetypes (`pickThemeFrom`, the
     extracted weighted core of `pickTheme` — identical rng shape, one float), so distinctness is
     guaranteed, deterministic, and testable as a hard assert. Extra draws ride each lane's own
     `:routetheme:` stream, so nothing else shifts. The split "two worlds" stop got the same treatment:
     `stitchSplitCourse`'s back half is distinct by ARCHETYPE now, not just theme id.
  2. **Four new skies.** `CourseEffectId` grew `eclipse` (the dated eclipse uniques + the planetary
     conjunction — a black sun, no longer generic "moonlight"), `ionStorm` (ion-storm/pulsar/quasar —
     the blue storm, distinct from the red solar one), `nebula` (star-nursery/galactic-core/void-rift/
     cosmic-jackpot), and `comet` (the comet events, distinct from a meteor shower). `routeEffect`'s
     regexes are ordered most-specific-first and ANCHORED where needed (`/(^|-)ions?(-|$)/` so
     opposition/apparition don't read as ion storms); `perseids`/`geminids` now correctly read as
     meteor showers and `iss-pass` as a junk field. The catalogue provably spreads across ALL ten
     non-none effects (`tests/journey-effects.test.ts`).
  3. **The wind hook — weather that BITES, fairly.** Each effect may carry a wind multiplier
     (`EFFECT_WIND`: ion storm ×1.35, solar storm ×1.2, nebula ×0.9, moonlight ×0.85, eclipse ×0.7),
     applied in `currentCourse` as a PURE post-generation transform on `hole.wind.spd`, clamped to
     `EFFECT_WIND_CAP` (46 — the generator's own band). Honest by construction: the transformed speed
     IS the hole's wind, so the HUD, the visible wind streaks, the club AI and the shot physics all
     read the SAME number; auto ≡ interactive holds because it's course data, not a driver-side knob.
     No rng, no geometry → `validateFairness`/`validateCrossings` untouched; a neutral effect returns
     the course OBJECT unchanged (byte-for-byte the old path — the whole suite is the guard, and the
     no-death-spiral harnesses stay green with the hook live). The route-info sheet surfaces it as a
     "💨 winds +35%" / "🍃 still air −30%" chip so the lever is readable before you commit the jump.
  RENDER (`weather.ts`): each new sky is a real showpiece — eclipse: indigo pall + black sun with
  wheeling corona streamers and a sliding diamond-ring glint; ion storm: blue-violet edge vignette,
  charged glowing sparks riding the gusts, and two families of BRANCHED forked lightning; nebula: vast
  seeded colour fog banks drifting and breathing over the sky half (alphas low so the course reads);
  comet: a blazing head with split ion/dust tails and a sparkle-dust fall. The weak ones got punched
  up: the junk field gains one BIG slow foreground derelict (panel seams, counter-phase nav lights),
  the trade camp gains rising warm lantern motes. All on their OWN mulberry streams (seeded off
  `o.seed ^ const`) so adding an effect never re-scatters the shared starfield/wind/ambient layout.
  No new `_gs*`/URL hook → the test-hub guard needs nothing. Tests: `tests/journey-variety.test.ts`
  (arc archetype coverage, hard-assert lane distinctness + never-current across seeds×hops,
  determinism, avoid-set fallback, split-stop archetype split) + the extended
  `tests/journey-effects.test.ts` (new mappings incl. the anchoring traps, spread across all ten
  effects, wind-mult ordering/band, exact per-hole wind scaling with deg untouched + clamp, neutral
  path untouched).
- **The meteor-shower route chars SCORCH CRATERS into the turf — the second effect that's also a game
  mechanic (GS-meteor-scorch, `src/sim/scorch.ts`).** The first GS-weather-play follow-on to the tents.
  Two pure ideas, mirroring GS-tents exactly:
  1. **PLACEMENT** — `meteorScorch(hole)` scatters up to `SCORCH_MAX` (6) craters (r 3.5–6yd) along the
     mid corridor (t ∈ 0.2–0.88 of the centreline, ±26yd lateral) on a PRIVATE rng stream seeded off the
     hole GEOMETRY (`scorch:tee:green:par`) — deterministic per hole, ZERO play-rng, so arming it changes
     no existing draw. Fairness by construction: a candidate is accepted only on SOFT TURF
     (`SCORCHABLE` = fairway/rough/waste/fescue — never the green, tee box, sand or a penalty surface,
     with explicit green/tee clearance margins) and clear of the other marks. A fixed 16-candidate
     budget, no unbounded loops.
  2. **THE LIE** — `executeShot` converts the REST lie to `scorch` when the ball settles on a mark
     (`LIE_INFO.scorch`: carry ×1.05 — it flies HOT off the baked crust — but dispersion ×1.45, wild;
     NEVER a penalty, gentler than trees/fescue). Conversion applies only to SCORCHABLE underlying lies
     (a green/sand/penalty rest keeps its stricter read) and is SKIPPED under Rainbow Road (whose
     off-road rule reads the unconverted rest lie — a scorched fairway is still the road). Gated behind
     `opts.meteorScorch` (default off ⇒ byte-for-byte; the ball's position/rng are identical armed or
     not — ONLY the lie label converts), threaded identically through the auto sim (`playerHoleOpts`,
     armed when `routeEffect === 'meteorShower'`), the interactive driver (`takeShot`/
     `resolveScrambleShot`, reducer passes `course.meta.effect === 'meteorShower'`) and the boss/partner
     (`match.ts`, like tents/rainbow) — so auto ≡ interactive and a duel stays fair.
  RENDER: `styleScorch` draws the craters in COURSE space in `buildScene` (gated `SceneOpts.meteorScorch`,
  baked at the app boundary by `scorchActive()`), from the SAME `meteorScorch(hole)` the sim reads — the
  footprint circle drawn IS the radius the lie conversion tests (the graphic is the physics). All crater
  variation is `posHash` (zero rng draws — the seeded scene streams untouched). A touchdown on a mark
  answers with an ash+ember `spawnLandFX` burst (keyed off the same `inScorch`), and the lie chip shows
  "Scorched +5% carry · wild" (the chip gained a carry-BONUS display — ice/crystal benefit too). NO new
  `_gs*`/URL hook (content/effect-derived, like tents), so the test-hub guard needs nothing. FAIRNESS
  proven by `tests/scorch.test.ts` (placement margins + soft-turf-only across seeds×biomes, purity,
  conversion fires + never-a-penalty, armed-vs-unarmed ball identical with only the lie label differing,
  the lie bites but sits below the trouble lies, and the no-death-spiral bar holds with scorch armed at
  wildness 1 across biomes). Eyes-on with `node scripts/scorch-preview.mjs`.
  **The shower now LANDS (GS-meteor-strikes, `render/weather.ts`).** The follow-up fiction fix: the sky
  meteors were screen-space streaks that faded mid-air while the craters sat below, fully formed —
  nothing connected them ("a random flying set of meteors and completely separate impact marks"). Now,
  on a meteor-shower stop, one meteor per cycle (2600ms) DIVES INTO one of the drawn craters and lands
  with an impact flash sized to the crater's true footprint + an ember splash + a soft distant-impact
  screen shake (`WeatherOpts.onStrike` → the play view's `shake`). Anchoring: `WeatherOpts.strikeTargets`
  is a per-frame callback (the `starMask` pattern) supplying the craters' SCREEN positions — the play
  view projects the SAME `meteorScorch(hole)` marks the sim reads through its LIVE projector, so strikes
  track the follow-cam and always land exactly on a drawn crater. The AIM overlay does NOT feed it: its
  local projector is wind-orientation only and would lie about crater positions (the same reason it
  can't feed `starMask` — documented at `mountWeatherOverlay`). Purely cosmetic + purely clock-driven:
  per-cycle picks ride a private mulberry seeded off the CYCLE INDEX (`seed ^ imul(k+1, φ)`), zero rng
  streams touched, and a strike RE-BURNS an existing mark — the mark set stays a pure function of the
  hole, so the physics never changes mid-hole. Off-screen targets are paint-culled (cadence unaffected —
  camera-safe). Guarded headlessly by `tests/weather-strikes.test.ts` (fake-ctx differential: strikes
  add draws only under meteorShower; null/empty targets are byte-identical to no targets; the onStrike
  cue fires exactly once per cycle; off-screen culling). Eyes-on: `node scripts/weather-preview.mjs`
  gained frozen dive/impact frames (plus the gravityWell/frostfall cases GS-journey-fx-2 forgot to add).
  **The shower now looks like METEORS (GS-meteor-look, `render/weather.ts`).** The strikes shipped but
  the play verdict stayed: "doesn't look like meteors at all, way too many, and they don't properly hit
  the impact craters." Three causes, three fixes, all screen-space cosmetic (zero rng-stream / sim
  impact): (1) TOO MANY — 14 ambient streaks whose loop kept each visible ~91% of the time, i.e. a
  constant 14-streak rain; now SIX fireballs on a sparse duty cycle (each flies ~a third of its loop)
  so ~2 ride the sky at once. They build on their OWN mulberry stream (`seed ^ 0xc2b2ae35`) so retuning
  the count never re-scatters the shared starfield/wind/ambient layout. (2) NOT METEORS — the old look
  was a 1.5px gradient-stroked line; now a shared `fireball()` painter draws a white-hot head inside a
  tapered, licking flame tail (a dense chain of shrinking blobs cooling white→amber→ember-red along the
  flight line, under 'lighter'). (3) NOT HITTING THE CRATERS — the ambient streaks used to plunge
  through the turf and fade mid-course while only the strike ever landed, so meteors visibly "missed"
  the marks everywhere (worst on the aim overlay, which has no strike targets at all). Now ambient
  fireballs BURN UP high in the sky (each carries a `burn` altitude; the last stretch pops a terminal
  flare and gutters out) — the ONLY meteor that ever reaches the ground is the strike, and it lands on
  a crater. The strike itself is the same `fireball()` at hero size (the object the shower teases is
  the object that lands), ACCELERATES in (f²) like a falling rock, picks an ON-SCREEN crater (scans
  from the seeded pick through the stable target order, so a cycle is never wasted diving at a mark
  the camera can't see; none visible → the old paint cull), and its impact gained a shock ring racing
  out over the crater footprint. Guards unchanged (`tests/weather-strikes.test.ts` is differential and
  stays green); eyes-on re-shot via `node scripts/weather-preview.mjs`.
- **EVERY course effect now carries a real play hook, and the sky-set widened again (GS-journey-fx-2,
  `effects.ts`/`sim/patches.ts`).** The play complaint: "the weather effects and the consequences for
  each journey really don't make any sense or have a lot of difference" — four of the ten skies
  (comet/aurora/spaceJunk/nebula-adjacent) were pure dressing, and the card never SAID what a sky did.
  Three coupled fixes, all riding existing machinery:
  1. **A second numeric hook — CARRY.** `EFFECT_CARRY` (aurora ×1.06 — the charged curtain lifts the
     ball; the new gravityWell ×0.92 — the giant's pull drags it), applied in `currentCourse`'s
     `applyEffectPhysics` (the renamed `applyEffectWind`) as a pure post-gen `biomeMods` carry row —
     the SAME mechanism low-gravity biomes use, so `biomeCarryMult` feeds the HUD range preview, club
     suggestions, layup AI and shot physics ONE identical number with ZERO driver threading; auto ≡
     interactive by construction. Kept in a ±10% band (machine-checked) so club coverage never breaks.
     The `note` on the appended mod is the effect id (handy for tests/debug).
  2. **The scorch machinery GENERALISED into ground patches** (`sim/patches.ts`, the GS-weather-play
     backlog item). `effectPatches(hole, kind)` = the exact scorch placement algorithm (mid-corridor
     band, soft-turf-only, green/tee margins, 16-candidate budget) on a per-kind private stream
     (`patch:<kind>:tee:green:par`); `PATCH_SPECS` maps each family to its `LIE_INFO` row: **comet →
     `stardust`** (carry ×1.08, dispersion ×0.9 — the one patch you AIM for, a bonus not a burn),
     **frostfall → `ice`** (the existing slick row), **spaceJunk → `junk`** (carry ×0.85, dispersion
     ×1.6 — worse than rough, gentler than trees). One new `groundPatch?: PatchKind` opt threaded
     everywhere `meteorScorch` already went (`playerHoleOpts` via `effectPatchKind(routeEffect(…))`,
     reducer → `takeShot`/`resolveScrambleShot`, boss/partner via `match.ts`, render via
     `stylePatches` in `buildScene` + per-family `spawnLandFX` bursts). Same guarantees, proven by
     `tests/patches.test.ts` (mirrors scorch.test.ts, all three families + armed-vs-unarmed ball
     identity + the no-death-spiral bar per family). NOTE for tests: frost's `ice` lie ALSO occurs
     naturally on ice worlds — assert against the RAW surface (`lieAt` of the rest), not the label.
  3. **Two new skies + ~16 new events + a legible card.** `gravityWell` (ONE vast seeded ringed giant
     looming in the sky — `drawGravityWell`; a heavy violet pall) and `frostfall` (big six-point
     crystals sifting straight down — `drawFrostfall`; wind ×0.9 — its danger is on the GROUND), both
     on a third mulberry stream (`o.seed ^ 0x85ebca6b`) so earlier layers never re-scatter.
     `routeEffect` grew ordered regex families — gravity (`gravit|slingshot|neutron|dwarf|singular|
     rogue|(^|-)tide(-|$)|supermoon|black-hole|horizon`, BEFORE /moon/ so the supermoon's tide-pull
     lore reads true) and frost (`frost|cryo|glacial|frozen|freeze|hail` or a ❄ icon) — remapping
     `supermoon`/`gravity-slingshot` to the well. The catalogue gained ~13 recurring + 2 unique
     events spread across arcs/rarities/categories (frost-drift, stardust-wake, gravity-eddy,
     hail-belt, neutron-tide, comet-dust-run, cryo-harvest, wreckers-claim, white-dwarf-passage,
     glacial-veil, junker-armada, rogue-planet, great-comet-harvest; uniques deep-freeze +
     event-horizon), and provably spreads across ALL TWELVE non-none effects. LEGIBILITY: the
     route-info sheet now computes wind AND carry chips from the physics tables (they can never
     drift from the course) and shows each geometric hook's one-liner via the new
     `CourseEffectInfo.play` field ("🎯 Ice patches freeze the turf — slick, skiddy lies"). The
     capstone guard: `tests/journey-effects.test.ts` asserts EVERY non-none effect has at least one
     hook (wind ≠ 1 | carry ≠ 1 | patch | tents | craters) — a new sky can never ship as pure
     dressing again. NO new `_gs*`/URL hook, so the test-hub guard needs nothing.
- **Five more skies + a sticky new lie (GS-journey-weather, `effects.ts`/`sim/patches.ts`/`render/weather.ts`).**
  Prompted by "I thought we'd added a heap of weather events but I'm not seeing any new ones" — the
  GS-journey-fx-2 work WAS all shipped (12 effects, full physics + visuals); the ask was simply MORE
  variety. The roster grows 12 → 17, every one reusing the proven wind/carry/patch machinery so no new
  physics extreme touches the no-death-spiral envelope:
  1. **`blizzard`** — wind ×1.3 + the frostfall `ice` patch. The storm-cold cousin of frostfall (which
     is calm+icy); this is *gale+icy*, a genuinely new combo. `drawBlizzard` streaks dense flakes ALONG
     the wind under a gust-pulsing whiteout veil (distinct from frostfall's gentle straight-down fall).
  2. **`radiant`** — carry ×1.06 + wind ×0.82. A bomber's-paradise sky: still, bright air, the ball
     flies far and true. `drawRadiant` pours slow god-rays from one brilliant seeded star.
  3. **`dustStorm`** — wind ×1.25 + carry ×0.94. Grit that gusts AND drags — the meanest combo.
     `drawDustStorm` sweeps parallax grit motes + rolling ochre fronts.
  4. **`solarWind`** — wind ×1.15. A steady laminar particle stream (`drawSolarWind`) — a third storm
     that isn't lightning, so it reads distinct from solar/ion.
  5. **`darkMatter`** — wind ×0.78 + a NEW `tar` patch. The "really spacey" one: `drawDarkMatter`
     drifts dark clouds with cold violet star-lensing rims over an eerily still sky. `tar` (`PATCH_SPECS`
     + `LIE_INFO`, carry ×0.78 / dispersion ×1.05) is the sticky, dead-straight INVERSE of ice's wild
     skid — the ball plugs, robbed of distance but not sprayed (the sim models "no roll" as lost carry,
     since roll is a landing-time integral, not a per-lie coefficient). Drawn as a glossy black gravitic
     sink in `stylePatches`, with a heavy low `spawnLandFX` glob.
  All five showpieces build on a FOURTH mulberry stream (`o.seed ^ 0x27d4eb2f`) so no earlier scatter
  moves; `routeEffect` gained five ordered regex families placed so their tokens win the collisions
  (`snowstorm` doesn't fall to the solar STORM regex, `solar-wind` beats bare `solar`, `stardust`/
  `stellar-tailwind` stay comet/moonlight, `dark-matter` isn't a gravity SINGULARity). ~10 new events
  (radiant-bloom, sunbath-drift, solar-wind, dust-storm, snow-squall, blizzard, helios-gale, sirocco,
  dark-matter-fog, umbral-veil) spread arc-tiered across all five. Adding events shifts the seeded route
  draw, so one pinned-seed ace fixture (`ui.test.ts` GS-ace-ship) was re-pinned (seed 74 → 185). No new
  `_gs*`/URL hook (content + a patch kind the hub absorbs automatically), so the test-hub guard needs
  nothing. Eyes-on: `scripts/weather-preview.mjs` + `scripts/patches-preview.mjs` both cover the new set.
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
- **Cosmetics split into BUY (global) vs EQUIP (per character) — the Clubhouse (GS-clubhouse, save v10).**
  The old combined `outpost` screen (which bundled the rotating ship market + a global Garage + a global
  Wardrobe) is gone, replaced by two surfaces:
  - **Trade Market** (`screen: 'trademarket'`, `tradeMarketScreen`): the acquisition surface. It now shows
    the FULL ship catalogue (`shipCatalogue()`) AND the full apparel catalogue side-by-side, plus the Bag &
    Club Sets. The **rotating ship offer + paid reroll are RETIRED** (`marketOffer`/`marketRerollCost`/
    `MARKET_*`/`marketSeed`/`rerollMarket` all deleted) — a "proper shop" browses everything and scarcity is
    the SHARD PRICE (the Mothership stays the 1,000-shard grail). Buying grants GLOBAL ownership only
    (`buyShip`/`buyApparel` no longer auto-equip — there's no character context at the market).
  - **Clubhouse** (`screen: 'clubhouse'` + a title-screen `clubhouseSection` of all four golfers): the
    outfitting surface, ONE character at a time (`manageCharacterId`). Each golfer picks an owned ship
    (`selectShip` → `shipByCharacter`) and wears owned hats/shirts (`equipApparel` toggle → `hatByCharacter`/
    `shirtByCharacter`); the wardrobe shows ONLY owned pieces (buying lives at the market). So each of the
    four characters can fly a different ride and wear a different look.
  - **Resolution:** the journey-map ship and `golferLook()` resolve the PLAYED character's gear via the pure
    exports `shipForCharacter`/`hatForCharacter`/`shirtForCharacter` (an owned pick, else the default wagon /
    no apparel). Cosmetic-only — nothing here touches the sim, so determinism is untouched and no rng draws move.
  - **Save v10** (v9→v10 migration): the old global `selectedShip`/`equippedHat`/`equippedShirt` are seeded
    onto EVERY character so an existing player's look is preserved exactly, then they can diverge; `marketSeed`
    is dropped. A defensive backfill drops any per-character entry referencing an unowned item. Tests:
    `tests/ships.test.ts` (full catalogue ordering), `tests/save.test.ts` (v10 migration + per-character seeding +
    unowned-drop), `tests/ui.test.ts` (buy-global / equip-per-character / guards / per-character independence).
- **A third apparel slot — PANTS (GS-pants-outfit, save v11).** Apparel was a two-slot wardrobe (hat +
  shirt); pants make the golfer dressable head-to-toe. The work was deliberately a CONTENT + plumbing change,
  not an engine one — pants reuse every existing rail:
  - **Data:** `ApparelSlot` becomes `'hat' | 'shirt' | 'pants'`, a new `PantsShape` union
    (`trousers`/`shorts`/`knickers`/`leggings`/`spacepants`/`nebula`), and eight new `APPAREL` rows — one pair
    per existing set so each clothing set can be completed (Rookie classic trousers + safari shorts, Tour
    trousers, Gentleman plus-fours, Champion slacks, Neon leggings, Astronaut space-suit legs, Supernova
    leggings), spanning every rarity tier incl. a mythic. Pants ride the SAME `ownedApparel` pool and
    `APPAREL_COST` ladder — no new economy.
  - **Set completion generalised:** `equippedSet(hat, shirt, pants)` now reports a set complete only when
    EVERY slot that set defines in the catalogue is worn (a three-piece set needs all three; a two-slot set
    like Gentleman = hat + pants needs both). This tightened the old "any matching hat+shirt" rule — a partial
    set no longer sparkles — which is the intended "complete the set" semantics now that sets can be 3-piece.
  - **Equip + render:** `pantsByCharacter` mirrors `hat`/`shirtByCharacter` exactly (`equipApparel` routes by
    slot to the right map; `pantsForCharacter` resolves the played golfer's pick). `golferLook()` layers a
    `pantsStyle` onto the on-course canvas golfer — `playView.ts drawGolfer` swaps its default dark legs for a
    `drawPants` that shapes/tints them (shorts bare the shin, knickers buckle below the knee, spacepants add
    mag-boots, glow tiers get an aura); with NO pants equipped the original legs draw byte-for-byte unchanged.
    The wardrobe SVG gains a `pantsGlyph` card icon and the `golferPreviewSVG` mannequin grew legs so the
    preview shows the full outfit. The Trade Market + Clubhouse each gained a 👖 Pants rack (the racks are
    `apparelForSlot`-driven, so they absorbed the new slot automatically).
  - **Save v11** (v10→v11 migration seeds an empty `pantsByCharacter`; the shared sanitize drops unowned
    pants entries). No new `window._gs*` hook or `?param`, so the test hub needed no wiring. Tests:
    `tests/apparel.test.ts` (pants tier coverage + three-/two-slot set completion), `tests/ui.test.ts`
    (buy-global / equip-per-character pants), `tests/save.test.ts` (v11 round-trip + v10→v11 migration + unowned-drop).
  - **Trade Market accordion (GS-market-accordion).** The browsable catalogue kept growing (Ships + Hats +
    Shirts + Pants + Bag & Club Sets = one very long scroll), so each rack is now a collapsible `marketSection`
    (`app.ts`): a uniform header bar — icon · title · `owned/total` count pill · ▾ chevron — over the card rack,
    tap to fold. The Clothing H2/H3 grouping is gone; hats/shirts/pants are now three peer top-level sections.
    Collapse state is module-local `collapsedMarketSections: Set<string>` toggled by `[data-toggle-section]` +
    `render()` — the SAME view-only pattern as `inspectGearId`/`mapView`, NOT reducer/save state (native
    `<details>` can't be used: `render()` replaces `app.innerHTML` on every buy, which would reset the open
    state). Default = every section expanded (non-surprising). The three card builders (`shipCardHTML` /
    `apparelCardChrome` / `bagSetCardHTML`, also used in the Clubhouse) were unified to a single 130px width +
    matching name/sub/footer type so items advertise consistently across sections. CSS is the `.gs-acc*` block
    in `index.html`. No new hook or save bump → no test-hub wiring; full suite stays green.
- **The Clubhouse became a tap-to-restyle stage (GS-clubhouse-stage).** The per-golfer `clubhouseScreen`
  used to be a long, hard-to-parse scroll: a small mannequin, then a garage rack, then three flat wardrobe
  racks (hats/shirts/pants) all shown at once. Reframed around the golfer as the interface:
  - **The stage.** A big full-body avatar (`golferPreviewSVG(…, w:150, h:210)`). The mannequin is ONE
    proportional full-body figure at every size (head/hip/foot are fractions of `h`; every authored offset is
    scaled by `S = h/210`, authored at the stage's h=210) with arms, so the figure reads as three clean tap
    bands here AND stays in proportion at the lounge's small `h=84` (a fixed head+neck used to stunt the small
    figure into a tiny chest + stretched legs). The `legsFull` flag it replaced is gone.
  - **Arms are SHAPED limbs drawn BEHIND the torso (GS-avatar-arms).** The first pass hung each arm as two
    thin `<line>` strokes beside the body — a gap at the shoulder made every outfit read as bolted-on pegs
    (worst on the astronaut/full suits). Now `armUnit` builds a tapered filled outline through
    shoulder→upper→elbow→wrist joints (`limb()`, a perpendicular-offset walk with a rounded wrist cap) and the
    figure draws arms BEFORE the torso, so the deltoid root is swallowed by the shoulder and the arm grows out
    of the body. The sleeve reuses the torso's own `shg` gradient (lighting runs continuous shoulder-to-cuff),
    the bare forearm its own `skg` skin gradient, plus a faint outer rim highlight for roundness. Sleeve length
    is shirt-shape keyed: short cap (polo/tee/jersey/default) → sleeve stops at the upper arm over a skin
    forearm; full cover (spacesuit/cosmic/blazer) → sleeve to the wrist with a pressure-cuff+glove (suits) or a
    jacket cuff+bare hand (blazer). Hand is a rounded ellipse tucked onto the wrist, not a floating ball.
    Over it sit three transparent tap zones (`.gs-czone--hat/--shirt/--pants`, absolutely positioned bands),
    each with a floating chip naming the worn piece + a ✎ pencil. Below the figure, a **garage bay** tile
    (`clubhouseGarageArt`: a hangar/launch-pad SVG scene — open star-bay, neon pillars tinted by the ride's
    rarity, the parked ship via `shipSVG`) is a fourth tap target for the ride.
  - **Hats size to the head they sit on (GS-wardrobe-cosmetics).** The SVG `hatGlyph` (apparelArt.ts) used
    to draw FIXED ~11u shapes anchored 6u above the head, so an *enclosing* hat (the astronaut `helmet`,
    the supernova `halo`) landed as a small bubble perched on top of the big stage/lounge head instead of
    covering it. `hatGlyph(look, cx, cy, r, uid)` is now HEAD-RADIUS parameterized: shapes are authored in a
    canonical head-centre frame at R0=7 — the SAME numbers as the on-course `drawHat` (playView.ts) — then a
    single `scale(r/R0)` fits them to the real head (`headR` in the preview, a chosen `hatR` in the card), so
    the helmet encloses the head exactly as on-course. GOTCHA: the SVG preview is FRONT-facing (the figure
    looks at you) while `drawHat`'s canvas is PROFILE (down-the-line, brim points +x); brimmed hats
    (cap/visor) therefore keep symmetric front brims in the SVG — do NOT "sync" them to point sideways, the
    viewpoints differ on purpose. Enclosing/symmetric hats (helmet/halo/tophat/crown/bucket) match both ways.
  - **Reveal-one interaction.** Tapping a body part or the garage opens `clubhousePicker` — just THAT slot's
    owned rack (the same `clubhouseApparelCardHTML` equip toggles / `shipCardHTML` fleet as before; empty
    apparel slots show a Trade-Market buy button). The open slot is `clubhouseSlot: ApparelSlot | 'ship' | null`,
    view-only module state toggled by `[data-clubslot]` + `render()` and reset on Clubhouse open/close — the
    SAME pattern as `inspectGearId`/`collapsedMarketSections`, NOT reducer/save state. The pure reducer
    (`selectShip`/`equipApparel`) and every `tests/ui.test.ts` assertion are untouched, so the live
    preview-updates-as-you-equip contract and per-character isolation still hold. No new `window._gs*` hook or
    `?param`, no save bump → no test-hub wiring; CSS is the `.gs-cstage`/`.gs-czone`/`.gs-garage`/`.gs-cpick`
    block in `index.html`.
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

- **Only a NEW Ascension clear, not every win.** The reward fires when a won voyage pushes
  `maxAscension` higher — the same gate the bag tiers use (`unlockedAscension(state, run) >
  state.maxAscension`), NOT on every `endedReason === 'won'`. Clearing A0 the first time pays out, but
  re-clearing a tier you already hold grants nothing; each tier rewards a club exactly once per save.
  At `ASCENSION_MAX` there's no higher tier to unlock, so the cap stops paying (consistent with the
  bag-tier gates topping out at A11). The club still lands on the *played character* — the tier you clear
  decides *whether* you get a club; the golfer you played decides *whose* bag it joins.
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
  the reducer wiring (new clear → club, full bag → shards, re-clear of a held tier → nothing, cut →
  nothing).

## A fresh run opens on a RANDOM, non-hard world (GS-fresh-start)
- **The complaint:** the Voyage "always seems to start on the same biome for each difficulty". True by
  construction — `app.ts` booted every session with the fixed fallback seed `1234` and the title's
  Start buttons reuse `state.run.seed`, so stop 0 (`themeForStop(seed, 0, 0)`) was the SAME world on
  every fresh page load at every Ascension, and the journey lanes (`routeTheme`, also keyed off the
  run seed) repeated identically. Ascension never feeds the seed, so "per difficulty" was literally
  "always".
- **Fix 1 — the boot seed is random (`app.ts freshRunSeed()`).** `seedFromUrl() ?? freshRunSeed()`
  (was `?? 1234`); the gameover "New run" button and the `recover()` fault path use the same helper
  (New run already rolled `Math.random` inline — now shared). This is the ONE sanctioned
  `Math.random` spot: it only picks WHICH fully-deterministic run you get, in the side-effect layer —
  the sim/render layers stay seeded-rng-only. `?seed=` still PINS the seed (repro, sharing, the test
  hub's demos — no new hook, the guard needs nothing), and the Daily Challenge is untouched: it
  travels `restart → seed: dailySeed()` → title, and Start reuses that run seed as before. With the
  seed random per boot/new-run, the journey-map lanes randomize for free — no sim change needed there.
- **Fix 2 — stop 0 skips the hard worlds (`themes.ts HARD_ARCHETYPES`).** `themeForStop` at
  `stopIndex === 0` draws from the arc pool FILTERED of `inferno`/`tempest`/`void`/`cetus` (the lava
  world, the galaxy's wildest winds, and the two lost-ball abysses) via `pickThemeFrom` — the SAME
  single rarity-weighted float on the same `:theme:0` stream, just a gentler pool, so no other stream
  moves. You tee off on a readable world; travel can land the hard ones from stop 1 on (arc 1 only
  carries inferno+tempest anyway — the filter leaves 6 archetypes across 11 themes). Old resumes at
  stop > 0 without a `pendingTheme` still take the unfiltered fallback.
- **Test fallout, on purpose:** remapping stop-0 themes changed which scripted seeds clear the opening
  cut — `tests/ui.test.ts`'s "passing seed" 3 became a miss, re-pinned to seed 15 (verified: clears
  stop 0, survives 5 stops, terminates). New guards in `tests/themes.test.ts`: 300 seeds never open on
  a `HARD_ARCHETYPES` world yet spread across ≥4 archetypes, and later stops STILL land hard worlds
  (the filter is stop-0 only).

## The Unending Universe — the endless survival format (GS-unending)

**What shipped.** The two original endless roguelites (`flat` 6-hole stops, `ladder` 3→6→9→9→18) were
RETIRED and replaced by one endless mode: **Unending Universe** (`FORMATS.unending`, the new
`DEFAULT_FORMAT`). Four random holes → Pro Shop → journey-lane choice → four more, forever. The whole
meta-loop (shop, three-lane starmap with distinct destination worlds, route events, credits, ghost
leaderboard flavour) is reused unchanged; what's new is the SURVIVAL LAW and the milestone ladder.

**The survival bar (`src/sim/rpg/endless.ts`, pure).** Every hole of the run carries a required score,
numbered cumulatively across stops (`run.holesSurvived + holeIndex + 1`) and PAR-RELATIVE so a par-3
and a par-5 are equally fair (golf-soul rule — the user-facing "8/7/6/5/4" spec is exactly this ladder
on a par 4): holes 1–8 quad bogey, then triple / double / bogey / par per 8-hole block, and from hole
41 on only birdie-or-better keeps the run alive, forever. A pickup (never holed out) always fails.
Miss the bar once → the stop ends AT THAT HOLE and the run is over (`endedReason 'cut'`).

**Why this stays deterministic + auto ≡ interactive.** Both drivers play the stop's holes sequentially
on the single `${course.seed}:play` stream, so "stop at the first failed hole" is a clean PREFIX of the
full-stop stream: `playStop` breaks its hole loop where `passesEndlessGate` fails; the interactive
`holeComplete` calls the same predicate (`endlessHolePassed`, reading the canonical `record` + `holed`)
and finishes the stop with the partial `stopPlayed`. `finishStop` recounts the leading passes
(`gateSurvived`), so both paths score identically — guarded end-to-end by `tests/endless.test.ts`'s
"interactive dies at the same hole as the headless sim" run. Voyage and boss paths are untouched
(the gate branch only arms on `format.holeGate`).

**Difficulty design.** The bar ramps on HOLE COUNT; course wildness keeps ramping on GALAXY DISTANCE
(your jump choice) + `routeDifficulty` (a risky lane's `cutDelta` already generates a wilder course —
which is also why the route UI in this mode rewrites "cut +1" copy to "wilder course" and drops the
cut chip: the Stableford cut simply doesn't exist here). So after the bar parks at birdie (hole 41+),
the universe still escalates every set, per the spec. Balance read at ship time: a no-upgrade auto-AI
survives median ~24 holes (max 35 over 60 seeds) — hole 40 is meant to need a real build, and the
birdie wall makes 60+ heroic. Tune from real play (see IDEAS GS-unending follow-ons); the mode is not
in any death-spiral harness bar (those are biome/character-keyed and unchanged).

**Milestones + the Evergreen set.** Crossing 40/60/80/100/120/140 survived holes fires a full-screen
victory takeover (`showEndlessMilestone`, mirroring the voyage victory — cosmetic side-effect in
`dispatch`, keyed off the pre/post `holesSurvived` diff) and banks a growing shard bonus INSTANTLY via
`run.bonusShards` (a kept-even-on-a-bust channel — banked shards can't be clawed back by a later death).
The shard bonus is now LIFETIME-once (GS-unending-rewards), exactly like the cosmetic unlocks below: the
reducer passes its persisted `endlessBestHoles` as `finishStop`'s `prevBestHoles`, and the milestone
floor `max(run.holesSurvived, prevBestHoles)` means a milestone already reached in a PRIOR run banks
nothing when re-crossed (the celebration still fires; `showEndlessMilestone`'s shard line reads the
lifetime-gated total, so a re-crossing shows ✦ 0). The headless sim omits `prevBestHoles`, so every
seeded run stays byte-identical (per-run behaviour, floor 0). Permanent unlocks ride the LIFETIME best (`endlessBestHoles`, save v13): the earn-only
**Evergreen** cosmetic set — Tour Bag @40 (a NEW 4th apparel slot `bag`, equipped per character via
`golfBagByCharacter`, drawn beside the Clubhouse stage figure; on-course rendering deliberately skipped),
Baggy Green Cap @60 (new `baggy` hat shape), Evergreen Pro Pants @80, THE GREEN JACKET @100 (mythic, new
`blazer` shirt shape with lapels/crest both in SVG and on-course canvas) — plus a SECRET mythic ship at
150, **The Infinity Ace** (new `infinity` ship kind: phoenix wings, triple aurora exhaust, orbiting
lights, ∞ pennant), hidden from the Trade Market entirely until owned. Unlock rows carry `unlockHoles`;
`canBuyApparel`/`canBuyShip` refuse them (the market shows a 🔒 milestone footer instead), and the
reducer's `endlessProgressUpdates` pushes crossed ids into `ownedApparel`/`ownedShips` at EVERY
stop-scoring site (milestones cross mid-run). `equippedSet` gained an optional 4th bag argument — the
Evergreen set completes only head-to-toe-to-bag.

**Removal fallout (for the next archaeologist).** `DEFAULT_FORMAT` is `'unending'`; `getFormat` folds
retired/unknown ids to it so an old save's active `flat`/`ladder` run resumes as unending mid-journey.
`app.ts`'s one hardcoded `FORMATS['flat']!` fallback became `getFormat`; the test hub's scoring-harness
dropdown default moved to `unending`. `tests/ui.test.ts`'s `started()` helper and several format
literals retargeted; the ladder-escalation test became the unending survival-walk test. The secret-mask
copy is "? ? ?" (spaced) — a literal "???" trips `tests/build.test.ts`'s no-`??`-in-bundle guard.
`restart` now also carries `clubhouseVisit` + `endlessBestHoles` (the former was a pre-existing drop —
the lounge shuffle counter reset to 0 on every restart).

## The Clubhouse glow-up (GS-clubhouse-glow): cel-shaded golfers + a real 19th-hole bar

The clubhouse looked flat next to the on-course game: stick-figure golfers (line legs, no face, no
shading), garment details authored at fixed pixel sizes that vanished on the big stage torso, and a
lounge whose "bar" read as a bookshelf. Reframed so the clubhouse **stands on its own** — the only
contract with the course view is that the outfit is *recognisable* (same `ApparelLook` shapes +
palette); the rendering style is free to differ (front-facing, cel-shaded, detailed) because the
course view is a tiny profile glimpsed mid-swing anyway.

- **`golferPreviewSVG` is a character now**: gradient-shaded torso with cel highlight/shade bands
  (clipped to the torso path), shaped tapered legs with real shoes, elbow-bent arms (shirt sleeve →
  skin forearm → hand), neck, ears, and a face (eyes+catchlights, brows, smile, blush). Per-shape
  pants tailoring on the legs: shorts bare shins + ankle socks + hem bands, plus-fours puff into
  accent cuffs + white socks, spacepants get accent mag-boot shells, leggings/trousers get seam/
  pinstripe lines, nebula gets stars; a belt with an accent buckle covers the shirt hem. The three
  tap-band anchors (head 0.19h / hip 0.58h / feet 0.93h) are UNCHANGED — the stage `.gs-czone` CSS
  still lines up.
- **When no cosmetic hat is worn the figure wears its SIGNATURE CAP** (`opts.capColor`, the same
  default cap the on-course `drawGolfer` paints), so a fresh character is identifiable in the hall.
- **`shirtDetail` is canonical-frame + scale** (`(look, cx, cy, s=1)`), like `hatGlyph`: the wardrobe
  card uses s=1, the figure passes `S*1.55` and clips the detail to the torso — details no longer
  shrink into specks as the torso grows. Card glyphs are otherwise untouched.
- **SVG def ids collide across co-mounted figures** (the GS-cetus-4 class of bug: ids are
  document-global, and the lounge mounts four figures). `uid` namespaces every gradient/clip; it
  DEFAULTS to a hash of the figure's inputs so an unthreaded caller can't cross-tint two different
  outfits (identical hashes ⇒ identical looks ⇒ harmless). The stage passes `uid:'stage'`, the lounge
  `lg<characterId>`.
- **The lounge is a furnished 19th-hole bar** (`loungeArt`, still hand-placed / zero-rng / animated
  only via `<animate>`): stone fireplace with arched firebox, mantel trophy/photo/crossed-clubs
  plaque, the clubhouse cat asleep on the hearthstone; leather armchair + floor lamp; a picture
  window onto the space course (ringed planet, shooting star, pin flag); dartboard + crooked course
  painting; and a REAL bar — mirrored back-bar with shaped bottles (necks, not book-spines) on lit
  shelves, hanging stemware, wood counter with taps + poured drinks, panelled front, brass foot rail
  and two cushioned stools under a flickering neon **19th Hole** sign. Floor spots re-anchored to
  the furniture (hearth / rug / armchair / bar). GOTCHA that cost a round: the bar pendant lamps and
  the neon sign occupied the same wall band and the lamp bulbs sat exactly on the sign's "1", so
  "19th Hole" read "9th Hole" — the sign is the bar's light source now, don't re-hang lamps there.
- **Eyes-on loop**: `scripts/clubhouse-preview.mjs` (esbuild + Playwright screenshot; PNG path via
  `CLUBHOUSE_PREVIEW_PNG`) renders seven stage outfits, a lounge-size figure and two shuffled lounge
  visits — re-shoot it after touching `apparelArt.ts` or `clubhouseLounge.ts`. No new hook, no save
  bump, no reducer change; full suite green (the change is render-string-only).

## Golfer gender presentation via hair only (GS-avatar-gender)

The four golfers all drew as one identical, featureless (bald) body — the roster carried pronoun
identities (`Character.identity`) but nothing on screen reflected them. Brief: make each golfer read a
little more as their gender **while keeping every cosmetic fully gender-neutral and equally good on
everyone** — explicitly no bust/curve shaping, "all spacesuits are non-gendered so the look should be
non-gendered too." So the load-bearing decision: **gender presentation lives ONLY in the head layer.**

- **Hair is the whole mechanism.** A render-only `GolferStyle.hair` (`GolferHair`: `style` +
  `color` + optional `facial:'stubble'`) threads through `golferPreviewSVG`'s `opts.hair` into a new
  `hairLayers()` in `apparelArt.ts`, which returns three z-layers the figure assembler slots in: `back`
  (a rear mass behind the head), `top` (scalp cap + face-framing side locks + fringe, over the skin and
  under any hat), and `face` (a faint stubble wash). Everything is authored in the figure's existing
  proportional head frame (`cx`/`headY`/`headR`/`S`), so it scales cleanly from the 190-wide stage to the
  72-wide lounge figure.
- **The body and every garment are byte-identical for all four.** `torsoPath`, the limbs, the legs and
  the shirt/pants/spacesuit glyphs are untouched — a garment drapes over the same silhouette for
  everyone, which is what keeps outfits inclusive. There is no per-gender body branch anywhere, by
  design; if that ever felt necessary the honest move is to NOT ship it (the brief said as much).
- **A sealed helmet hides hair.** `sealed = hat.look.shape === 'helmet'` skips all hair, so the moment
  any golfer dons the astronaut suit they read as an identical sealed astronaut — the non-gendered
  spacesuit made literal. Other hats (cap/bucket/visor/tophat/crown/baggy/halo) sit on top and the hair
  shows below the brim, as real hair does.
- **Style is a length/shape spectrum, not a gender switch:** `crop` (short) → `sweep` (side-swept) →
  `tousled` (medium) → `coils` (voluminous). Any golfer could wear any of them; each row just picks the
  look that fits. Current picks: Feather `coils` (she/her), Bo `tousled` (they/them), Larry `crop` +
  stubble (he/him), Huang-Woo `sweep` (identity opened to `he / she / they`).
- **Scope + guarantees.** Render-only, no rng, no save bump, no reducer/hook change; sim stays pure
  (the type lives in `sim/rpg/characters.ts`, the drawing in `render/apparelArt.ts` — render reads sim,
  never the reverse). Only the front-facing clubhouse/wardrobe figure gained hair; the on-course profile
  `drawGolfer` and the select-card `golferSVG` stick figures are deliberately left plain (out of scope).
  Eyes-on via the existing `scripts/clubhouse-preview.mjs` (its lounge golfers now carry hair); full
  suite green.

## The Clubhouse spaceport + figure scale fix (GS-clubhouse-spaceport)

Two eyes-on complaints after the glow-up shipped: the lounge golfers still read as dolls next to the
furniture, and the bottom half of the hall screen was dead space with nowhere to show off the equipped
rides.

- **The doll bug was a FRAME bug, not a figure bug.** The lounge asked `golferPreviewSVG` for a 66×88
  frame — but the figure's horizontal offsets scale off `S = h/210`, so at h=88 the drawn body spanned
  only ~40% of that frame's width; the button was sized by frame width, so the visible golfer was both
  skinny and short (~65 room-units vs the 74-unit armchair). THE RULE: size lounge/stage mounts off a
  TIGHT frame — the lounge now asks for **72×210** (fits arms + auras + tall hats, nothing else) and
  sizes buttons at `11.2·s cqw`, which lands the figures at ~1.5× the armchair, human-proportioned at
  every container width. A wide frame renders as invisible margin and silently shrinks the character.
- **Cosmetic pop** is three dials, all in `apparelArt.ts`: steeper garment gradients (`shade` ±0.22…0.3),
  stronger cel highlight/shade band opacities, and `shirtDetail` scaled `S*1.75`. Plus a lounge-side
  **rarity glow**: `popFilter` wraps any golfer wearing (or ship being) rare+ gear in a
  `drop-shadow` of `cosmeticRarCol`, growing with `cosmeticRarOrder` — owned treasure reads across the room.
- **The spaceport** (`spaceportArt`/`spaceportHTML` in `clubhouseLounge.ts`) fills the bottom half: a
  floating tarmac landing RING around a putting green (flag, bunker, waiting ball), blinking rim
  lights, control tower, windsock, a teal neon **Spaceport** gate sign, and FOUR painted pads — two on
  the back band (s=0.72), two up front. Each golfer's equipped ride (`shipId` on `LoungeGolfer`,
  resolved by the caller via `shipForCharacter`) parks on a pad as a `shipSVG` button firing the same
  `openClubhouse` action as tapping the golfer, nameplate at its nose, cap-colour pad glow beneath.
  The ship glyph mounts in a tight `96×62` frame with a `-3cqw` bottom margin tucking the nameplate
  under the hull — without both, the ship floats visibly above its pad (the first cut did).
- **Determinism**: pads are dealt by the SAME visit-seeded `Rng`, with the pad draws AFTER the spot
  draws — a given visit's lounge arrangement is byte-identical to before the spaceport existed, and
  the fleet "re-parks" between runs like the golfers mill around. Zero sim/rng-stream impact, no save
  bump, no new hook; `clubhouse-preview.mjs` now carries `shipId` fixtures (wagon / mothership / racer
  / moto) — re-shoot it after touching the spaceport art.
- **Second pass — spacey, not raceway** (same PR family): the first cut's asphalt-grey annulus +
  dashed GOLD centreline + gold pad paint + windsock read as a racetrack/airport. The deck is now
  blue-steel HULL PLATING (radial seams every 30° between the rim ellipses), the centreline a
  continuous pulsing teal ENERGY CONDUIT, the pads recessed HOLO discs (breathing teal projection
  ring + ice ticks), the windsock a grav-beacon (pulsing orb + radar ping), and the green sits under
  a GLASS BIO-DOME (a low lens `M94,138 A106,44… A106,40.5… Z` with meridian seams + specular sweep,
  painted OVER the flag/bunker so they read through glass). Nebula washes, twinkle stars, drifting
  asteroids and anti-grav emitter cones sell the float. Road-paint gold is banned on the deck —
  station markings are energy-teal/ice; brass stays reserved for the nameplates.
- **Third pass — the hub is a GARDEN, not a pitch**: the flat turf oval + concentric mow rings read
  as a football stadium. The dome now holds a real par-3 vignette: rough base (`spRough` + mottle
  blobs) with a mown fairway RIBBON drawn as one thick round-capped stroke tee→green, its mow bands a
  duplicate path stroked `stroke-dasharray` in low-alpha white (banded segments along the curve — the
  cheap way to stripe a curved ribbon); a light-turf green with fringe ring, cup and the pin; two
  guarding bunkers; a teal-rimmed pond; cel garden trees (`tree()` helper) and moon-rocks, all inside
  a `spCourseClip` ellipse clip. Gotcha: a round fairway cap + two bright symmetric tee markers reads
  as a WORM WITH EYES — markers are small, white and staggered.
- **Fourth pass — one cohesive deck + a ship at the pump (GS-clubhouse-starport-redesign).** The
  accreted second/third passes had bolted a clubhouse building, a control tower, a grav-beacon, a
  fuel pump and TWO neon signs onto the orbital ring + bio-dome — a busy, incoherent picture, and the
  fuel station stood empty. Rebuilt as ONE scene that reads as *the view out the bar's picture window*:
  the sky, ringed golden planet and bright moon are lifted straight from `loungeArt`'s window so the
  lounge and the panel are the same vista. The orbital ring/bio-dome are gone, replaced by a single
  floating GOLF-DECK slab (anti-grav under-glow + a `spDeckSide` front rim for thickness + edge rim
  lights) with an open-air par-3 green on top (`spTurf` + `spGreenClip`: ribbon, fringe/cup, bunker,
  tee, ball, trees) and a small warm CLUBHOUSE at its back — a twin of the bar, warm picture windows +
  a pink **"19th Hole"** facade marquee, so the window above literally looks out from here. One neon
  **SPACEPORT** marquee on posts is the only station sign. Control tower / grav-beacon / dome cut.
- **Berths, not pads — and a ship at the pump.** The four parking spots are now a `Berth` list
  (`BERTHS`): THREE holo landing pads (`PAD_ART`, drawn by the reused `padArt`) + ONE fuelling station
  (`fuelStationArt`: recessed amber service disc, pump cabinet + gauge, canisters, hose to the parked
  ship, ⛽ FUEL neon). The visit-seeded shuffle deals the four golfers across the berths, so each run
  home the fleet re-parks AND a DIFFERENT equipped ride is the one topping up at the pump — the
  "randomly equipped ship in the fuel station" the same way the golfers change position. Every ride is
  still the `openClubhouse` button (nameplate at the nose); the fuel-berth ship swaps its hover hint to
  "⛽ Fuelling" and glows warm-amber instead of cap-colour. Determinism unchanged: still zero
  sim/rng-stream impact, no save bump, no hook — the ONLY randomness is the berth shuffle (which now
  also decides the pump occupant). Re-shoot `clubhouse-preview.mjs` after touching the deck art.

## Hide unlock-gated gear from the Trade Market until it's unlockable (GS-hide-unlocks)
- **The problem.** The Trade Market rendered the FULL catalogue including gear you can't touch yet:
  the earn-only Unending-Universe cosmetics showed as greyed "🔒 Survive 40 holes" teasers, and the
  locked Ascension club-set bag tiers as "🔒 Clear A2" teasers. The secret hole-150 ship was the ONE
  thing already hidden (`!s.secret || owned`). The player wanted the market to only ever show what you
  can actually buy now or already own — no spoilers, no shelf full of padlocks.
- **The rule, split by acquisition kind.**
  - **Earn-only cosmetics** (ships/apparel with `unlockHoles`, plus the `secret` grail) — hidden until
    OWNED. You never *buy* these, so "available" = you earned it. Once owned they reappear in the market
    greyed "✓ owned" (and become equippable in the Clubhouse).
  - **Gated-but-purchasable club sets** (`bag.ts BAG_SETS`, GS-bag-tiers) — hidden until UNLOCKED (their
    Ascension gate cleared ⇔ available to buy), or already owned. These ARE bought with shards, so they
    reveal the moment you *can* buy them, not when you own them.
- **One reveal predicate per catalogue**, all pure and unit-tested (`tests/endless.test.ts`):
  `shipRevealedInMarket(ship, owned)`, `apparelRevealedInMarket(item, owned)`,
  `bagSetRevealedInMarket(set, maxAscension, currentTier)`. `tradeMarketScreen`/`bagSetSection` filter by
  them; a section with nothing revealed (Caddy Bags before any is earned; club sets before the first gate)
  drops out of the accordion entirely rather than showing an empty rack. The per-card "locked" footer
  branches (`marketApparelCardHTML`, `bagSetCardHTML`) are now unreachable for visible cards and kept only
  as defensive fallbacks.
- **Cost of the change: nil beyond render.** Pure display filter — no sim, no rng stream, no save bump.
  A future secret unlock is just another `unlockHoles`/`secret` catalogue row (or a gated `BAG_SETS` row);
  the reveal predicate picks it up with no market edit. The bag-set roadmap hint was also degraded to a
  generic "clear a higher gate" line so a not-yet-unlocked tier's NAME isn't spoiled before it's earned.

## The Comet Rider becomes a hole-in-one unlock (GS-ace-ship)

- **What changed.** The Comet Rider — a golf-ball comet that was a 300-shard legendary ship on the Trade
  Market rack — is now a **secret, free ride earned by making a hole-in-one**, and nothing else. The `SHIPS`
  row flips `cost: TIER_COST.legendary → 0` and gains `secret: true` (it keeps `rarity: 'legendary'` for its
  ring/blurb colour). No `unlockHoles` — this is an *event* unlock, not an endless-holes count, so the two
  reveal gates read the same but the earn path is different.
- **Why any ace, not the first.** The ask was "awarded to their first hole-in-one, but a player who already
  aced before this shipped must not be locked out forever." We don't retro-scan `lifetimeAces` at migration
  (that would be a retroactive grant), and we can't tie the reward to a *first-ace* transition (0→1) because
  a veteran already past that would never fire it. The resolution: grant on **any ace the player doesn't yet
  own the ship on** (`aceShipUnlock(ownedShips, aces)`). A brand-new player earns it on their genuine first
  ace; a veteran earns it on their *next* ace. Idempotent once owned, so it never double-grants. This is the
  only design that satisfies both halves of the request without a save bump.
- **Where it's wired.** A pure `aceUpdates(state, result, baseOwnedShips)` helper (the sibling of
  `runEndUpdates`/`endlessProgressUpdates`) returns the `lifetimeAces` tally **and** the ship grant, spread
  LAST at all four stop-scoring sites in `reduce` (auto + interactive, ordinary + matchplay-boss). It takes
  `baseOwnedShips` = the owned list *after* any `endlessProgressUpdates` unlock at that site, so a hole-150
  crossing and an ace on the same stop both land (compose, don't clobber). Ownership is global
  (`ownedShips`), matching the request that the account — not the played golfer — earns the ship; which
  golfer *flies* it is still a Clubhouse choice.
- **The reveal.** The ace takeover (`showAceCelebration`) gains an optional `shipUnlocked` reward line
  ("🛸 SECRET UNLOCKED — the Comet Rider"). The app sets it from `!state.ownedShips.includes(ACE_SHIP_ID)`
  at celebration time (before stop scoring commits the grant), so the surprise reveals on exactly the ace
  that earns it. Purely cosmetic — the reducer is the source of truth for ownership.
- **Contracts.** Zero rng draws, zero stream reorder (all 871 existing seeded tests byte-identical); no save
  bump (`ownedShips` already persists, migrations already default-seed it). `canBuyShip` refuses it (cost 0),
  `shipRevealedInMarket` hides it until owned — so it silently drops off the market rack until the ace lands.
  Tests: `tests/ships.test.ts` (the `aceShipUnlock` rule + market gating), `tests/ui.test.ts` (a full-flow
  integration on pinned voyage seed 74, which aces early and lands the ship in `ownedShips`).
- **Follow-ons.** The old 300-shard legendary slot in the Exotic set is now empty of a *buyable* legendary
  (the set still has `ufo-saucer` epic); if the market wants another mid-tier Exotic later, add a new row —
  don't un-secret the Comet Rider. A future event-earned ship is the same shape: `secret:true`/`cost:0` row +
  a reducer grant on its trigger; no market or reveal-predicate edit needed.

## GS-golf-score — the Unending Universe scored as a round of golf + a last-runs leaderboard

**Why.** The endless mode's only score was "holes survived" + a Stableford ghost field borrowed from
the voyage. That reads as a survival counter, not *golf*. Players think in gross / to-par / net, and a
roguelike wants a *personal* record wall to chase — not a fictional field of AI golfers who don't
matter (survival is decided per-hole, so their standings were pure flavour). This makes the Unending
Universe present as a real round and gives it its own leaderboard.

**What it is NOT.** It does **not** touch survival. The per-hole par-relative bar (`passesEndlessGate`),
the milestone ladder, the cosmetic unlocks, the no-death-spiral harness, and every seeded test are all
unchanged. Gross/par accumulate on the Run but are read by NOBODY in the survival/scoring path — they're
presentation + a per-run record. `finishStop` advances them **only** for `holeGate` formats and **only**
over the SURVIVED prefix of a stop (the same holes `holesSurvived` counts), so the voyage stays
byte-for-byte and the mid-round card can never disagree with the banked record.

**Scoring model.**
- `Run.grossStrokes` / `Run.parPlayed` — cumulative over survived holes; snapshotted (optional fields,
  back-compat) so a resume keeps the round; 0 for non-gate formats. To-par = gross − par.
- **Net** (`endless.ts netStrokes`) applies a course handicap read off the STARTING CLUB SET, prorated
  to holes played (green 18/18 → one stroke a hole … legendary scratch). A weaker set gets more strokes,
  so net scores compare fairly across bags — the whole point of splitting the leaderboard by set.

**Difficulty = the starting club set** (`CLUB_SET_DIFFICULTIES`, green/blue/purple/orange = common→
legendary rarity, reusing `RARITY_C` colours). Picked on character-select for endless only (a `data-clubset`
chip row mirroring the voyage's `data-asc` ascension row), **bounded to the owned `bagTier`** (green always;
higher tiers only if unlocked in the voyage) — so it can never grant a free bag upgrade, and `common`
selection is the historical default (byte-identical). The reducer re-clamps (`bagTierRank`). The voyage
ignores the chip and always plays the full owned tier.

**The last-runs leaderboard** (`endlessRuns`, save v16). A finished endless run banks one
`EndlessRunRecord` (golfer, club set, holes reached, gross, par, ascension, seed) — prepended newest-first,
capped at `ENDLESS_RECORDS_KEPT`. Written in **exactly one place**, the reducer's `runEndUpdates` (the
single shared run-end site), gated on `holeGateArmed` + a character, so every end path logs it once and the
voyage logs nothing. Displayed grouped by the four club sets with a per-set best-holes strip + the 🏅
best-effort row.

**Render** (`render/endlessCards.ts`, pure like `golferCards.ts`): `endlessScoreCard` (holes · gross ·
to-par · net + next bar/milestone) and `endlessRecordsBoard` (the grouped last-runs board). Wired into the
arc intro (replaces the ghost field), the end-of-hole card (replaces the ghost live leaderboard), the stop
result, and the gameover recap — **all gated on `holeGateArmed`**, so the voyage's screens are untouched.
No `window._gs*`/`?param` hook added, so the test-hub sync guard needs nothing.

Tests: `tests/endless.test.ts` (club-set handicap monotonicity + proration, net floor, to-par format,
record prepend/cap/best-effort/net-to-par, `finishStop` survived-only accumulation + snapshot round-trip,
voyage-stays-0, `runEndUpdates` records once / voyage records nothing) and `tests/save.test.ts` (v15→v16
migration + record round-trip).

## GS-boss-scale + GS-ai-attack — bosses scale with Ascension; the auto-AI pin-hunts under pressure (2026-07-04)

**Problem (player report).** Bosses were "too easy to beat at A4 and higher — even with scramble /
best-ball it still loses easily", and the team formats "never seem to make a difference".

**Diagnosis (measured, `scratchpad` harnesses over the pure sim).** Two separate truths:
1. The team formats WORK mechanically — over 900 seeded holes, scramble saved 0.52 strokes/hole and
   best-ball 0.85 vs the same side solo; the partner's ball counts on ~32% of best-ball holes. The
   "no difference" perception is real anyway: the PLAYER-side partner is an auto-AI ball, so a
   skilled human's own ball beats it nearly always (the assist matters to the AI, not to you), and
   the BOSS-side assist (~0.85 str/hole) was nowhere near the human-vs-boss gap.
2. `match.ts` never read Ascension. The boss played the identical common-bag, fixed-handicap game at
   A0 and A15 while the player's build grew every tier (bag tiers at A3/A7/A11, perks, unlocks) —
   measured: boss 4.18 strokes/hole flat, while player builds walked from 4.89 (A0) to 4.59 (A8-ish).

**Fix.** Every duel now carries a `BossEdge` derived from the RUN (`bossEdgeForRun` — one source for
headless `playStop` and both reducer pre-play sites, so auto ≡ interactive by construction):
- **Handicap** −`BOSS_ASC_HANDICAP` (0.7)/tier, floored at scratch above A0 (elite bosses start ~4,
  so this saturates early by design);
- **Dispersion** ×(1 − `BOSS_ASC_DISPERSION`·asc) floored at `BOSS_ASC_DISPERSION_FLOOR` — the knob
  that keeps biting after handicap bottoms out;
- **Distance** +`BOSS_ASC_DISTANCE` (2yd)/tier on the distance clubs;
- **Gear parity**: the boss's bag re-stamps to the run's OWN `bagTier` via `applyBagTier` (tier
  first, distance boost after — applyBagTier rebuilds carries from the set rows), incl. the tier
  putter's `puttBoost` through the new `puttSkill` opt;
- **Pin-hunting** from `BOSS_ATTACK_ASCENSION` (4) up, via GS-ai-attack below.
Calibration (200-hole sweeps, top-rated boss): strokes/hole 4.16 (A0, byte-identical) → 3.91 (A4) →
3.86 (A8) → 3.74 (A12); the boss's hole-win share vs a matching AI player build now RISES with tier
(45.8% → 47.2%) instead of eroding. Knobs are named constants in `match.ts` — retune from playtests.
Also fixed while in here: BOTH interactive boss pre-play sites dropped the solo boss's home-turf
edge (`playBossStop(..., false, ...)` / an omitted `homeEdge` arg) that headless `playStop` applied
— an auto ≢ interactive drift on the boss's ball, now resolved like the headless path.

**GS-ai-attack.** `PlayHoleOptions.attackPin` (default off = byte-identical): on a green-REACH shot
(the shared `attackTarget` rule — some usable club's carry×carryMult covers the flag) the AI aims at
the FLAG instead of the fat-of-green percentage play; lay-ups untouched; club choice + physics
identical machinery. Armed (a) in the Unending Universe once the survival bar is bogey-or-tighter
(`endlessAttackArmed`, `ENDLESS_ATTACK_GATE = 1` — hole 25+), threaded through headless `playStop`
AND the interactive `autoShotHole`→`autoDecision(…, attackPin)` so contract 2 holds; (b) for
high-Ascension bosses. Every voyage player-ball and calm-bar endless hole is byte-identical (the
whole 921-test suite passed unmodified).

**GS-ai-attack putt fix.** `playHole`'s auto putt-out ran DEFAULT skill while the interactive
auto-putt used `puttSkillOf(loadout)` — putter perks worked only interactively (silent auto ≢
interactive drift, and part of why shopping barely moved the endless AI's depth). `PlayHoleOptions.
puttSkill` now threads it (`playerHoleOpts` passes `puttSkillOf(run.loadout)`; `{}` on a stock
loadout = byte-identical).

**Endless depth after the tune** (`scripts/endless-ai-depth.ts`, 200 seeds/config): purple/orange
greedy+shallowest now mean ~27.2, median 28, p90 35–36, reach-32 ~33% (was 27–29%), reach-40 3–4%
(was 0–1%), max 46. The bogey-bar wall (holes 25–32) still dominates deaths — those are BLOW-UPS
(penalty/pickup chains), not missing birdies, so the next depth lever is course-management (club
down off the tee on tight corridors), GS-cetus-6-adjacent — NOT more aggression.

Tests: `tests/boss-scale.test.ts` (A0+common byte-identity incl. the played ball, knob monotonicity,
attack flip at the tier, gear parity, determinism + better-golf-on-average) and
`tests/ai-attack.test.ts` (off = byte-identity, attackTarget reach rule, endless arming table,
auto ≡ interactive under attack, puttSkill {} identity + boost sinks more, attack lands nearer the
flag on average).

## GS-warp — Warp mode: the hidden automatic-birdie rule + the range leaderboard (2026-07-04)

**Problem.** The Unending Universe made players replay 40–50 low-effort holes to get back to their
frontier. Two measurement passes (see `reports/endless-ai-depth-2026-07-04.md` + its addenda)
closed off every "honest" fast-forward: the solo auto-AI caps at ~hole 28 median; an N-ball crew
scramble lifts the median (~35 at 4 balls) but not the guarantee (~hole 13 at any crew size —
blow-ups are correlated through the shared aim/club decision); and NO assist reaches hole 100+
because the 41+ birdie-or-better bar compounds exponentially (76%/hole birdie even at 32
balls/stroke → ~1e-4 % over 60 holes). Conclusion: deep resumption must be format-blessed, not
earned by a better AI.

**The rule.** Warp auto-plays whole stops instantly on the ordinary `:play` stream (same courses,
same engine, pin-attack arming and all), then FLOORS each hole at a BIRDIE — `warpBirdieHole`:
holed in `min(actual, par−1)` (never <1; a real eagle/ace stands; a pickup becomes the birdie). It
is the deliberate mirror of the pickup rule (disasters cap at par+4 → warped holes floor at par−1),
and a birdie beats every survival bar, so a warped stop can never bust. "Hidden" = it's presented
as warp, not as a score cheat; the scorecard reads as plausible golf and the leaderboard RANGE
(below) discloses it structurally.

**Fairness by scope.** `canWarpStop(run, bestHoles, stopHoles)`: Unending only; only while the run
is a contiguous warp prefix (`run.holesSurvived === run.warpedThrough` — you cannot resume warping
after a real swing, so a record's range is always one clean span); and only while the WHOLE stop
fits under the player's proven `endlessBestHoles`. New ground is therefore always hand-played:
`endlessBestHoles` can only rise through real golf, so milestones and the Evergreen unlocks stay
un-farmable. A warped stop banks NO milestone shards (`finishStop`'s new `warp` opt — warp is
instant + retryable, so banking would be a per-run shard faucet) and the reducer's `warpStop` case
deliberately omits `aceUpdates` (an auto-birdied prefix can't earn the Comet Rider). Credits DO
accrue off the birdie-floored card — the build you arrive with is the run's engine, same as if
you'd survived those stops for real.

**State + persistence.** `Run.warpedThrough` (0 = unwarped) advances in lock-step with
`holesSurvived` inside `playStopWarp`; snapshotted (`RunSnapshot.warpedThrough`) so a resume keeps
the range. `EndlessRunRecord.startHole` = `warpedThrough + 1` (absent = from the first tee). Save
**v17** — a pure version stamp (both fields optional; old data correctly reads as unwarped).

**The range leaderboard.** The last-runs board now ranks the newest 10 records by FURTHEST HOLE
REACHED (`endlessRecordsByDepth`; ties by net-to-par) — per the design call that the actual score
is flavour, depth is the game — and every row shows `recordRange` ("1–49" solo, "⚡ 50–67" warped),
so a warped run is honestly distinguishable at a glance without a second board.

**Determinism.** Warp adds ZERO draws to any existing path: `playStopWarp` plays the identical
`:play` stream a watch-path would (the birdie floor is post-processing), all gating is pure, and
the whole 941-test suite passes with only the save-version literals bumped. Guarded by
`tests/warp.test.ts` (birdie floor incl. pickups, scope gates, lock-step prefix, same-stream proof,
milestone suppression, snapshot round-trip, reducer flow, range sorting, v17 migration).

## GS-fuel — Ship fuel meters the journey; the depot, the auto-buy, and stranding (2026-07-05)

**The ask.** Every jump on the journey map should cost fuel equal to its distance (1 step = 1 unit,
2 steps = 2). The Voyage starts with exactly enough to finish on single hops; the Unending Universe
starts with 25 units; both need a way to buy more. Plus a fuelling station on the Clubhouse
spaceport panel.

**The tank.** `Run.fuel`, seeded by `RunFormat.startingFuel` via `startingFuelFor` — voyage **8**
(= its 9 stops − 1 travels, machine-checked against `stops.length` in `tests/fuel.test.ts` so a
re-shaped campaign can't silently strand the frugal player), unending **25**, unknown ids fall to
`DEFAULT_STARTING_FUEL` (25; they fold into the default format anyway). A jump burns
`routeFuelCost(route)` = `distanceJump`, unit for unit.

**One rule in `travel` (auto ≡ interactive by construction).** Rather than gate the jump in two
places, `travel` itself owns the fuel rule: a short tank AUTO-BUYS the missing units at the flat
depot price (`FUEL_UNIT_COST` = 20 credits — noticeable against ~12 cr/Stableford-point stop
income, far from ruinous), paid BEFORE the toll (which stays floored at zero). Only when the purse
can't cover the shortfall is the lane locked — `canTravel` says no, the reducer's `route` case
no-ops, the route sheet disables the Jump button, and `travel` throws if called anyway. The
headless `simulateRun` honours the strategy's pick while payable, else falls back to the cheapest
payable lane. The explicit `buyFuel(run, units)` (Pro-Shop **Fuel Depot** card + the journey
screen) is the same price — pre-buying is a legibility choice, not a discount — clamped to tank cap
(`FUEL_TANK_MAX` 99) and purse.

**Stranding.** With NO payable lane the run ends `'stranded'` (new `EndReason`; `strand(run)`, the
reducer's `strand` action behind the travel screen's 🆘 banner). Design call: stranded credits
convert to shards like a bank — running dry is a forced stop, not a missed cut, and the leftovers
are below one fuel unit by definition, so it's a courtesy, not a loophole. In practice a player
earns ~100+ credits per passed stop, so stranding only bites a player who spends the purse to zero
AND drains the tank — real teeth, rarely felt.

**Determinism + persistence.** The whole system is pure arithmetic on the Run — ZERO rng draws, so
every seeded stream is byte-identical; the 971-test suite passes with only save-version literals
bumped (plus one hop-without-playing variety test given a fat purse). `RunSnapshot.fuel` persists
the gauge; save **v18** is a pure version stamp — a pre-fuel active run resumes with the format's
fresh tank (generous; an old save can never resume already stranded).

**Surfaces.** Header chip (`⛽ N`, red when ≤2), starmap planet labels (`+2 jump · ⛽2`), route
sheet fuel chips (burn + auto-buy surcharge + out-of-range lock), Fuel Depot on shop + travel
screens, stranded gameover heading, and the spaceport's hand-placed (zero-rng) fuelling station —
amber pump island + fuel cells + neon ⛽ FUEL sign between the two front pads (re-shot
`scripts/clubhouse-preview.mjs`).

## GS-fuel-2 — Fuel becomes a decision: depth pricing, a real tank, the gauge (2026-07-05)

**The critique (one session after GS-fuel shipped).** The v1 fuel system metered the journey but
DECIDED nothing: the price was flat (20 cr everywhere, forever), the unending tank (25) rarely ran
dry before the survival bar ended the run, and `travel`'s silent auto-buy meant the player never
even saw the transaction — fuel was a deferred credit tax wearing a resource costume. And the
presentation was a lone `⛽ 8` glyph in a text row plus an inline-styled text box — invisible on a
phone, styleless against the game's design language.

**The mechanics fix — an FTL-style price curve + a tank that binds.**
- `fuelUnitCost(run)` = `FUEL_PRICE_BASE (10) + FUEL_PRICE_SLOPE (2) · distanceFromStart`, capped
  at `FUEL_PRICE_MAX (60)`. Fuel near Earth is CHEAPER than v1; three arcs out it costs 3–6× as
  much. That makes "fill the tank at this shop or buy the epic driver and pay deep-space prices
  later" a genuine budget line — the classic roguelike money-vs-reach tension the flat price
  couldn't create (buying early was never better, so there was nothing to decide).
- The starting tank IS the capacity (`tankCapacity` = `startingFuelFor`): voyage 8 (unchanged —
  exactly its single-hop budget), unending **12** (down from 25, sized to run dry around stop 5–6
  when credits are meaningful). Capacity also bounds the stock-up-early exploit by construction.
- `travel` keeps the ONE-rule shortfall purchase (auto ≡ interactive by construction) but at the
  LOCAL price — and the route sheet prints the exact bill ON the launch button ("🚀 Refuel +2 ⛽
  (−28 cr) & jump"), so the surcharge is a commitment the player taps, never a silent deduction.
- Rejected alternatives: making `travel` throw without a manual depot visit (pure friction — same
  decision, more taps, worse on mobile); fuel-efficiency shop perks (adding a catalogue row
  perturbs seeded shop offers — parked in IDEAS); performance-based fuel rewards (scope).

**Balance, verified.** 40-seed probes of `simulateRun` on both formats are BYTE-IDENTICAL to the
pre-change code: the default auto-driver single-hops on a full tank and never touches the fuel
gate, so no seeded stream or outcome moved (the suite confirms — zero test fallout beyond
`tests/fuel.test.ts` itself). Unending strands 0/40 auto-runs (fuel is pressure, not a death
trap); a deep-jump voyage strategy pays its way through and still finishes.

**The presentation fix — one gauge, drawn everywhere.** `render/fuel.ts fuelGaugeHTML(fuel,
capacity, {mini,bare})` is the ONLY way fuel is rendered: a row of spaceship fuel CELLS (one per
capacity unit, lit to the tank level, cyan → amber → red via `fuelColour`; a legacy over-capacity
save shows a `+n` reserve chip, never a longer bar). Mini variant on the run header (every
screen), full variant on the journey screen's title pill and inside the restyled Fuel Depot — now
a `.gs-fueldepot` design-token panel headlining the LOCAL price ("14 cr / unit here") with +1 /
+3 / fill-the-tank quick-buys and the "fuel gets dearer the deeper you fly" rule stated in one
line. The starmap dims a fuel-locked world and swaps its jump label for a red `needs ⛽n ✕` (kept
SHORT — three labels share a row; the first cut collided with neighbours), so the blocker reads on
the map itself. Route-sheet chips collapse to one honest `⛽ before → after` readout.

**Persistence.** No save bump: `RunSnapshot.fuel` (v18) already round-trips, the price is derived,
and a legacy 25-fuel unending resume keeps its fuel — it just can't buy past the new capacity
until it burns down. Eyes-on verified end-to-end (Playwright drive: title → run → shop → travel →
jump; gauge burns 12 → 10 on a 2-jump) plus an edge-state fixture (all gauge fills, over-capacity,
locked lanes).

## GS-fuel-3 — Ship outfitting: Ion Thrusters, the Reserve Tank, the eagle siphon (2026-07-05)

**The ask.** Hang BUILD hooks off the GS-fuel-2 economy (the ideas parked from that PR), and when
the Ion Thrusters perk is owned, upgrade the journey-map ship's graphic with a proper ion drive.

**Ion Thrusters** (epic, 140 cr): `loadout.fuelEfficiency` — every journey jump burns 1 less unit,
FLOORED at 1 (`routeFuelCost(run, route)`, new run-aware signature; a jump is never free, so the
1-hop lane keeps its cost and the discount rewards DEEP jumps — the lanes fuel pressure was pushing
you away from). Travel economy only, never shot physics. Worth more the deeper (dearer) the fuel,
so it's a mid-run economy pick, not a day-one auto-buy. Every ⛽ bill honours it: the starmap
planet labels (`StarmapChoice.fuelCost`, may undercut `+n jump`), the route sheet's tank
before→after chip plus a cyan "🌀 ion drive −n ⛽" chip, and a depot note.

**Reserve Fuel Tank** (rare, 90 cr): `loadout.tankBonus` (+4) raises `tankCapacity`, and the relic
ARRIVES FULL via `ShopItem.fuelBonus` — poured in ONCE by `buy()` (clamped to the just-raised cap,
never draining a legacy over-capacity tank). Deliberately not part of `apply()`: resume rebuilds
the loadout from perk ids, but the fuel itself persists on `Run.fuel`, so re-applying would
double-grant — the ONE fuel-item gotcha, now documented on the field.

**The eagle siphon**: `finishStop` refuels one cell per holed EAGLE-OR-BETTER (an ace counts;
picked-up holes never do — `economy.eagleCount`, the `relicCreditBonus` sibling), capacity-clamped
and never on a warped stop (mirrors the milestone-shard rule). Great golf literally extends the
journey; applied in the shared `finishStop` so auto ≡ interactive by construction, and it can only
ever HELP (contract 4 safe).

**The ion wake (the "fully sick" bit).** `shipSVG(id, cx, cy, s, {ion})` grows an optional
`ionWake()`: a long layered stream (violet halo → cyan → white-hot core) flickering at engine
frequency, charge particles racing down the wake, a glowing nozzle ring. Drawn OVER the ship body
so it REPLACES the stock orange flame (drawn under, the flame poked through mid-wake — caught
eyes-on) but still inside the bob group so it moves with the hull; no defs/gradients (SVG ids are
document-global — the GS-cetus-4/clubhouse lesson). Default-off → every other mount (clubhouse
pads, market cards) is byte-identical. The journey map passes `StarmapOpts.ionThrusters` off the
live loadout.

**Blast radius, measured.** Adding catalogue rows reweights WHICH item seeded shops draw (never
the rng count) — the full suite stayed green (980 tests; offer tests assert distributions, not
exact stock). New art kinds `thruster`/`fueltank` in itemArt.ts give both relics bespoke cards.
Zero rng anywhere; no save bump (both fields rebuild via `loadoutFromPerks`; the tank's fuel rides
the persisted `Run.fuel`). Guards in `tests/fuel.test.ts` (GS-fuel-3 describe): the min-1 floor,
capacity + arrives-full clamps (incl. legacy over-capacity), resume round-trip without re-grant,
and the siphon (eagles yes / pars no / warp no / over-capacity never drained).

## GS-fuel-4 — Fuel earns agency: sky-priced lanes, tanker salvage, the sector scan (2026-07-06)

**The critique (the user's, one session after GS-fuel-3).** Three passes in, fuel still wasn't
adding player CHOICE: a jump's burn was glued to its distance (cost tracked reward exactly, so the
⛽ column never changed which lane you picked), fuel had exactly one use (jumping) and exactly two
sources (the depot and the rare eagle) — so managing it well was bookkeeping, not strategy. GS-fuel-4
attacks all three gaps without touching a single shot-physics or generation path.

**1. The sky prices the passage (`EFFECT_FUEL` / `effectFuelDelta`).** The lane's course effect —
the sky you fly into, already the wind/carry/patch play hook — now also carries a fuel delta:
solarWind/comet **−1 ⛽** (a tailwind at your back), gravityWell/ionStorm **+1 ⛽** (climb out of the
pull / batter through the storm). Folded into `routeFuelCost` (the ONE source), so the starmap
labels, route-sheet chips, shortfall bill and lane locks all price it automatically; the burn still
floors at 1 (a jump is never free). This DECOUPLES burn from distance — a tailwind Deep jump can
undercut a headwind Short hop, so the three lanes finally differ on a second economic axis — and it
retro-fixes `gravity-eddy`'s free lunch (+20% credits, cutDelta 0, no downside) with a themed cost.
Derived + zero rng (a pure table off the already-drawn event), so no stream moves. FAIRNESS,
machine-checked: no calm-CATEGORY lane maps to a headwind sky, so the guaranteed early-arc OUT is
never fuel-taxed (`tests/fuel.test.ts`); tailwinds only ever help. The route sheet states the hook
as an EFFECTIVE chip (`🌬 tailwind −1 ⛽` / `🌪 headwind +1 ⛽`) computed against the same floor the
bill uses — a tailwind that can't bite on a 1-hop shows nothing — and the ion-drive chip now shows
the drive's own saving under the sky, not the conflated total.

**2. Fuel comes from the world (`RouteEvent.fuelBonus`).** Three tanker lanes, arc-tiered and
rarity=stakes: the **Fuel Scow** (arc 1 common calm: +2 ⛽, credits −5% — poor-but-safe with tank
instead of pay), the **Derelict Tanker** (arc 2 rare calm: +3 ⛽; 'derelict' keys the spaceJunk sky,
so the free fuel costs you wreckage lies), and the **Fuel Caravan** (arc 3 epic toll: 70 cr toll →
+4 ⛽ + credits +25% + cut +1; 'caravan' keys the tradeMarket sky, tents on every green — at deep
prices 4 units ≈ 240 cr, so the toll is a genuine bargain WITH strings). Granted on arrival in
`travel` (auto ≡ interactive by construction), capacity-clamped, never draining a legacy over-full
tank. Honesty machine-checked: every `fuelBonus` desc states `refuel +n ⛽`. Pool rows reweight
WHICH events seeded runs draw (the GS-journey-fx-2 precedent) — one ace-fixture seed re-pinned
(471 → 430), zero other fallout.

**3. The sector scan (`scanRoutes`).** Fuel's first non-jump use: burn fuel to REDRAW the three
lanes. Price escalates per scan at the same stop (1, 2, 3… — the shop/StarMart reroll precedent, so
lane-fishing can't be spammed) and the scan always leaves ≥1 cell (`canScanRoutes`: fuel > cost —
you can never scan yourself dry). `routeOptions` re-keys its stream per scan
(`…:routes:N:scanK`; scan 0 keeps the classic key, byte-identical — contract 1 by construction),
so the redraw is pure and a resume reproduces the offer you paid for: `Run.routeScans` is
snapshotted (save **v19**, a pure stamp — unlike the shop reroll's UI-only count, scans burn a
persisted resource, so the paid-for offer must survive a park). Reset on travel. Interactive-only
like the shop reroll (the reducer's `scanRoutes` action; the headless driver never scans). When
EVERY lane is out of range the scan rides inside the 🆘 stranded box as the last-ditch lifeline —
eyes-on proved the tailwind alone can already rescue a would-be stranding (a locked board showed
one `⛽2` lane through a stardust wake while its neighbours read `needs ⛽3 ✕`).

**Anti-repeat approximation, documented:** `offerEventIds` (the "don't show last stop's lanes
again" rule) recomputes a PAST stop's offer on its scan-0 stream — the final scan count isn't
persisted per stop. Anti-repeat is a taste rule, not a contract; not worth a history-row field.

**Balance, verified.** 40-seed `simulateRun` probes: 0/40 stranded on both formats (headwinds don't
make the auto-driver stranding-prone); the death-spiral harnesses are untouched by construction
(travel economy only — no dispersion/generator/hazard change). Suite: 1008 tests green with only
save-version literals + the one ace seed re-pinned. Eyes-on (vite-node + Chromium off the real
screen builders): travel screen + scan button, tailwind sheet, tanker sheet, stranded lifeline.

**Rejected:** an "overdrive" (pay fuel to deepen a lane's jump) — a real depth throttle but it
bends the voyage's `maxJump` fairness cap and the wildness ramp, so it needs its own balance pass
(parked in IDEAS); making the scan redraw distances only (less interesting than fresh events);
per-scan rarity sweetening (would turn the scan into a loot slot machine rather than a travel tool).

**The sweep (GS-fuel-4 feel pass, same day).** The scan shipped as an instant table-swap — correct
but lifeless (the three lenses call that a bug). Now it's a beat: `showSectorScan`
(`render/celebrations.ts`, the showVoyageVictory cosmetic-side-effect pattern) plays a radar beam
climbing the journey map bottom → top with a blinking `📡 SCANNING…` chip, holds the redrawn lanes
dark, then pops them in staggered under expanding sonar ping-rings dropped at each world's MEASURED
screen position; `sfx.scan` (assetless, like every cue) voices it — sonar ping + echo, a rising
sweep under the beam, three data blips at the reveal. Choreography only: the reducer settled the
redraw before the animation starts (dispatch calls it synchronously after `render()`, same task, so
the fresh lanes never flash first), it fires only when a scan actually burnt fuel (`routeScans`
diffed across the reduce — a refused tap stays silent), the overlay swallows map taps so a hidden
lane can't be opened blind, and every failure path (throw mid-hide, re-render mid-sweep,
reduced-motion, headless node) degrades to "the new lanes are simply visible" — machine-checked
call-clean in `tests/audio.test.ts`. Timing knobs are plain module constants (the
ARC_FEEL/CADDY_SLOMO precedent — no new `_gs*` hook, so no test-hub wiring). Eyes-on verified by
driving the REAL app (vite dev server + Chromium: title → stop → travel → 📡): beam frame shows the
held-dark lanes, pop-in frame the fresh worlds + re-priced scan button, settled frame a clean
teardown.
