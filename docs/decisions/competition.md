# Archived engineering log — competition

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

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
- **Matchplay bosses (`src/sim/rpg/match.ts`).** A boss `mode: 'matchplay'` (voyage Arc-I + FINAL are solo
  duels; the Arc-II boss is a matchplay TEAM duel, GS-team-duel above) is a 1-on-1 DUEL vs the leaderboard leader on the actual
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
  reducer (`bossRewardFor`: a survived, non-final boss win) for every boss kind (solo matchplay + team duel). No
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
- **Eagle (−2) and albatross (−3) get their own fly-over celebration (GS-bird).** A holed −2 / −3 that
  ISN'T an ace fires a full-screen, assetless Canvas2D takeover — a stylised bird soaring across the
  starfield behind a themed headline card — mirroring `showAceCelebration` but PURELY COSMETIC (no
  reward, no save/reducer touch, so determinism is untouched). The **eagle** is a fast chrome-silver
  raptor (broad fingered wings) that screams overhead (`sfx.eagle()` — a stuttered "kek-kek" + a long
  descending screech); the **albatross** is a vast, slow, glowing-aurora glider (long high-aspect
  wings + an aurora sparkle trail) with an ethereal cosmic swell (`sfx.albatross()`). Precedence: ACE
  wins (a holed-out par-4 is technically an albatross, but a hole-in-one keeps its grander overlay) —
  the trigger order in the play-view `onDone` is `isAce → birdKind (relToPar ≤ −3 albatross, === −2
  eagle) → done`. Lives entirely in `app.ts` as a side-effect (`showBirdCelebration` + the seeded
  `runBirdFlight` rAF, mulberry32 — no `Math.random`; the loop self-stops on overlay teardown), gated
  once-per-hole by `birdCelebratedHole` (reset per hole in `render()` beside `aceCelebratedHole`).
  `HAPTICS.eagle`/`.albatross`, `sfx.eagle()`/`.albatross()` (assetless WebAudio synth), and the
  `.gs-bird`/`.gs-bird--eagle`/`.gs-bird--albatross` CSS (reuses the GS-ace keyframes) round it out.
  GOTCHA: the per-kind title gradient uses `background-image:` (NOT the `background` shorthand, which
  resets `background-clip:text` and renders the title as a blank bar). GOTCHA 2: the card's 🦅/🕊️ EMOJI
  is the dominant graphic, and on most platforms 🦅 is a brown/gold AMERICAN eagle — which clashed with
  the "silver space eagle" copy. The `.gs-bird--eagle .gs-bird-emoji` CSS `filter: grayscale(1)
  brightness(1.4) …` desaturates it into a chrome raptor (and the albatross emoji gets an aurora-glow
  filter) so the icon matches the canvas raptor + the prose. Canvas/audio feel is eyes-on
  (Playwright-verified per kind). NO new `_gs*` flag — the celebration delay rides the existing
  `_gsFeel.birdDelayMs` sub-field (default 380) like `aceDelayMs`, so the test-hub guard needs nothing.
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
    (set IDs stable for save-compat): rare = **Planet** (`tour` distance + `pro` scoring), epic = **Phoenix
    Flames** (`masters`), legendary = **Solar Storm** (`solar`, +24 carry). Each set row carries `theme`/
    `tint` (render-only). `equippedGearTheme(loadout)` returns the RAREST themed set the bag carries.
  - **Each theme is now a COMPLETE bag — woods + irons + wedges + a putter (GS-fullsets).** Originally
    Phoenix/Solar were `distanceOnly` (woods only) and no set had a putter; you couldn't assemble a full
    themed bag. Now `masters`/`solar` drop `distanceOnly` and cover scoring irons/wedges too (BASE carry —
    `buildRewardClub` only ever bumps DISTANCE clubs ≥ `DISTANCE_CLUB_CARRY`, so coverage clubs never
    overshoot, the same balance basis as `pro`), and all three themes gain a **putter**. The putter is the
    clean way a SCORING-class reward is a genuine, offerable improvement (the deferred "scoring upgrade via
    a real stat, not carry"): everyone owns a putter, so a themed putter carries no extra distance — its
    value is a wider make-window (`ClubSet.puttBoost`, rarity-scaled Planet 0.10 < Phoenix 0.16 < Solar
    0.22), folded into `loadout.puttBoost` by the item's `apply()` (so it rebuilds on resume since
    `loadoutFromPerks` replays every apply). `REWARD_CLUB_TYPES` gained `'putter'`; `setCoversType` gates
    putter coverage on `set.puttBoost !== undefined` (checked FIRST — a putter's tiny carry otherwise reads
    as "scoring"); `offerableClubs` offers a themed putter as a RARITY upgrade over the one you hold (same
    rule as a distance club's reach upgrade — its make-window is the gain). Planet's putter rides the `pro`
    line; `tour` stays distance-only. `clubOfferNote` flags a putter upgrade with `putt: true` (the badge
    reads "▲ UPGRADE · putt", not a misleading "+0 yd"). Render: `drawThemedClub` takes the club TYPE and
    draws a flat mallet blade + alignment line for a putter (vs the swept iron/wood face); the avatar's
    swung gear already reads `equippedGearTheme`, so collecting any themed club (incl. the new putters/irons)
    shows the theme on-course. Content-as-data → no new `_gs*`/URL hook (the Sim Lab absorbs the new rows).
    Tests: `tests/club-rewards.test.ts` (full-set coverage, base-carry irons, putter puttBoost + offer-as-
    rarity-upgrade + offer-note + snapshot/resume) and `tests/proshop-expansion.test.ts` (the complete-bag
    catalogue assertions).
  - **Procedural item images (`render/itemArt.ts`) + avatar gear (the "image changes your avatar" ask).**
    `itemArtSVG(id, rarity, setTheme)` is an assetless, deterministic SVG per item (house no-404 rule):
    the art KIND is resolved from the id (shaft/ball/glove/coin/putter/shoes/rangefinder/wedge/coach/trophy/
    caddy) — clubs draw a themed head (Planet ringed planet / Phoenix flame / Solar Storm sun rays); flavoured
    balls (water/lava/void/wind/distance) read by tint+effect. EVERY named caddy gets a BESPOKE SVG portrait
    (`CADDY_FIGURES`, matching its `caddyArt.ts` canvas figure — Penelope's flag, Dan's driver, Chipinski's
    lab coat + ringing phone, the bubble-helmeted Space Duck, the striped boomerang sheep, Sam offering a
    club, Sandy's bush hat, the spectacled Mole), NOT the generic bag glyph (the fallback for an unknown
    caddy id); `tests/proshop-expansion.test.ts` machine-checks that every `NAMED_CADDY_IDS` has one. Rendered atop each Pro Shop card via
    `itemCardHTML`'s new `artSVG`. The SAME themed look feeds the SWING: `GolferLook.gear` (resolved in
    `app.ts golferLook()` from `equippedGearTheme`) makes `drawGolfer` swing a GLOWING themed club head with
    trailing sparks — so the club you BUY is the club you swing. Render-only, NO new `_gs*`/URL hook (the
    test-hub guard needs nothing; the Sim Lab absorbs the new items as data). Tests:
    `tests/proshop-expansion.test.ts` (field apply/stack/cap, hazard-immunity behavioural proofs per biome
    + no-regression, solar set + `equippedGearTheme` rarity pick, deterministic art for every item).
- **Shop cards are EQUAL-SIZE, art is UNIQUE per item, rarity GLOWS, + a tappable gear inventory
  (GS-proshop-3).** Four coupled UI/art changes, all render-only (no sim/save/hook touch — the suite +
  test-hub guard are unaffected):
  - **Equal-size cards (`render/cards.ts itemCardHTML`).** Every card is a fixed `170×286` flex column:
    header → an always-present badge band (so reward-club pills don't misalign rows) → the fixed-aspect
    art → the description (`flex:1; overflow:hidden`, so long text clips instead of growing the card) →
    the cost footer pinned to the bottom. A mixed rack lines up regardless of text length / badge / art.
    (The `cards.test.ts` `opacity:1`/`opacity:0.5` asserts still hold.) The TITLE block itself is a
    FIXED-height row (`height:36px;overflow:hidden`) with the name `-webkit-line-clamp:2` — so a 1-, 2-
    or 3-line title all start the art at the SAME Y (a wrapping title used to push the art down and
    misalign the row, the "titles knock the shop images out of alignment" bug).
  - **Per-id EMBLEM roundels make shared-kind items unique (`render/itemArt.ts`).** Many items share a
    base art KIND (4 shafts, 5 gloves, 4 wedges, 4 trophies, 2 coins/putters/coaches) and so were
    near-identical (same kind glyph + same rarity colour). The base glyph stays (so each is still "the
    right picture for the item"), and a small top-right `roundel()` draws a vector symbol of what the
    item DOES (`EMBLEM[id]` — a power bolt, gyroscope rings, a tightening-window, speed chevrons, a
    crosshair, hook/slice/draw curve arrows, a clover, a sponsor shield, a bullseye, a spin spiral, a
    whistle, a mortarboard, a bird/eye/up-arrow/burst, …) so every card is UNIQUE and reads its function
    at a glance. Pure + deterministic (keyed off the id). Balls/caddies/clubs already bespoke/flavoured,
    so they skip the emblem.
  - **Rarity glow (`cardGlow`).** Common/rare keep the soft tint; EPIC gets a slight halo (`box-shadow`
    +`inset`); LEGENDARY a strong gold corona — plus `itemArtSVG` paints a faint radiant gold burst
    (`legendaryFlair`, gradient-free stacked circles + rays so duplicate cards on one page can't collide
    on an SVG `<def>` id) behind a legendary's art.
  - **New legendary `power-glove` — the 1989 NES Power Glove (`economy.ts` + `itemArt.ts drawPowerGlove`).**
    A unique legendary whose effect is MAX power: `overpower` floored at `0.4` (a 140% pull ceiling, +40%
    carry, far past the stackable Overdrive's 120%). Interactive-only (the auto sim always plays full swings), so
    it can't shift scoring or the death-spiral bar. Its own art kind `'powerglove'` draws the iconic grey
    gauntlet + dark control pad (green LCD + orange buttons) + gold finger sensors.
  - **Tappable gear inventory on the shop bag screen (`app.ts bagInventoryHTML`).** ABOVE the clubs row, a
    "🧤 Your gear" line shows every NON-club item you own (glove/ball/shoe/shaft/putter/caddy/relic) as a
    small art chip; tapping one (`data-inspect`, view-only module state `inspectGearId` like `selClubId`,
    no reducer/save/hook) pops its full card inline so you can compare it side-by-side with the shop stock.
  Eyes-on verified via `scripts/shop-cards-preview.mjs` (renders the real cards). Tests:
  `tests/proshop-expansion.test.ts` already asserts every shop item renders a deterministic SVG (now
  incl. `power-glove`); `tests/cards.test.ts` guards the equal-size card markup.
- **The legendary RAINBOW BALL turns every hole into RAINBOW ROAD (GS-rainbow) — a gloriously
  UNbalanced novelty.** Buy it (`rainbow-ball`, legendary) and `loadout.rainbowRoad` arms: the fairway/
  green/tee become a glowing rainbow ribbon through the stars and **anything off the fairway/bunkers/
  green is OUT OF BOUNDS** (stroke-and-distance). It deliberately BREAKS balance — there's no
  recoverable rough, so every miss is OOB — and that high-wire spectacle IS the fun; do NOT try to
  balance it. ONE source of truth for "what's safe": `ROAD_LIES`/`isRoadLie` in `shot.ts` (the mown
  turf + the SAND family: fairway/green/tee/bunker/pot/waste/sand) — shared by the sim (the OOB rule)
  and the renderer (which paints exactly those surfaces as road), so what you SEE as road is what's
  in-bounds. SIM: the rule lives ONCE in `executeShot` as the FIRST rest-consequence branch — a ball
  resting off-road reads as `'ob'` (replay from origin). It's PURE geometry on the rest lie (NO rng),
  default-OFF, so a base loadout is byte-for-byte unchanged (`tests/rainbow-ball.test.ts` guards the
  determinism contract + the OOB conversion + that a ball only ever rests on-road-or-OOB-or-holed).
  Threaded IDENTICALLY through the auto sim (`playerHoleOpts`→`playHole`) and the interactive driver
  (`takeShot`/`resolveScrambleShot`) so auto≡interactive. BOSS AWARENESS: the Rainbow Ball transforms
  the HOLE, not just your ball, so in a duel the boss/partner play the SAME rainbow road — `match.ts`'s
  `playMatchStop`/`playTeamMatchStop` inherit `rainbowRoad` from the player's opts onto `bossOpts` (the
  partner inherits via `baseOpts`), and `playBossStop`/`playBossSideStop` take a `rainbowRoad` param the
  reducer passes from the loadout — so best-ball/scramble stay fair (both sides on the wire) instead of
  the player alone on a brutal course. Rebuilt from the `rainbow-ball` perk id on resume (no save bump).
  RENDER: `SceneOpts.rainbow` (plumbed via `RenderOptions`/`PlayViewOpts`, baked from the live loadout by
  `app.ts rainbowActive()` like `lefty`/`effect`) makes `buildScene` paint the play surfaces as a
  `rainbowRibbon` (rainbow-banded clip + a glowing white rail) on ONE continuous band grid, drop the
  landmass + rough + non-sand hazards (off-road = the bare starfield void), and keep the sand (road-
  safe). All buildScene rng draws are KEPT (only the prim pushes change), so the art stream is stable
  and the default (non-rainbow) path is byte-for-byte unchanged — the holeView turf-fill + constellation
  count invariants still hold. The shop item draws a rainbow-trail BALL (`itemArt.ts` `'rainbow'`
  flavour). NO new `_gs*`/URL hook (content-as-data + a loadout-derived render option), so the test-hub
  guard needs nothing — the Sim Lab absorbs the item automatically. Eyes-on verified (Playwright render
  of the rainbow-road hole + the item card).

