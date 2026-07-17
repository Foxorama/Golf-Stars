# Golf Stars — idea backlog

Living doc (per CLAUDE.md): scan, rerank, merge, retire — **not append-only.** This file tracks **open
work**. Stable IDs, never reused. When something ships it collapses to a one-line **Done** entry (link the
PR/report); the full story lives in `reports/` + `docs/decisions/` + git, never here. Bad → **Dropped** (say why).

## Avenue decision (settled for now)
What wraps the golf: the **Voyage** is the winnable campaign and the **Unending Universe** (GS-unending)
is the endless survival mode — the old `flat`/`ladder` roguelites are retired (their machinery lives on
under the new format). Avenue (1), a full top-down RPG shell, stays deferred until the loop is exhausted.

## Now / next
Foundations are shipped; these are the live follow-ons.

**GS-story — Story Mode (the big one; systems roadmap in `docs/decisions/story-mode.md`, narrative canon in
`docs/decisions/story-bible.md`)**
Turn Star Tour into a standalone story-mode campaign, reusing the golf engine + content but forking the
meta layer into its own persistent progression (`StoryState`, `gs_story` save). Voyage/Unending/Clubhouse/
Trade Market stay frozen. Story: the Fairway Wardens (Parrot/Mothership) vs **the Coil** (Sinister Snake
Cult) racing to wake Jörmungandr; 5 Galaxy Tournaments (Lyra→Orion→Draco→split→Hydra Mire) → the Green Key
→ a Cthulhu-serpent SPACE BATTLE at Yggdrasil's root. A mid-story **CHOICE** (stay Warden / join the Coil)
forks into two DISTINCT world-routes (Warden void/crystal/frost vs Herald ocean/derelict/cetus) — different
NPCs, tournaments, cursed-relic vs Warden gear, ships, and ending; the Herald even crushes former allies
Dan & Penelope. Real divergence, still interconnected (shared shrine, cast reversed) — for replay value.
Ships user-facing as **"Story Tour"**; **Star Tour is the reward** — unlocked once the campaign is complete
(`storyComplete` = the `completed` flag OR all five Sigils). Every tappable item/world/relic/ship raises a
**lore card** (`GS-story-lore-cards`); new content ships with detailed flavour. Built as **chunks**, one
focused tested auto-merged PR each:
- **GS-story-save** — ✅ *model + `gs_story` persistence + New Game/Continue + hub shipped*. The spine.
- **GS-story-startour-unlock** — ✅ *rename Story Mode → "Story Tour"; Star Tour tile hidden→locked→open, gated on `storyComplete`.*
- **GS-story-lore-cards** — ✅ *foundation shipped* (`render/loreCard.ts`): reusable tap-to-inspect card (art + name + detail + composed lore + action). First consumer: the Pro Shop. Gear/ship/relic reuse it.
- **GS-story-prologue** — Earth final round (`standrews-18`) → win/victory → Mothership → Parrot recruit → story intro → Clubhouse.
- **GS-story-econ** — ✅ *shipped*: per-world Pro Shop (themed Planet/Phoenix/Solar clubs, lore cards), spend credits, buy→equip into the green bag, revisit (play again / pro shop). The green bag now tees off.
- **GS-story-clubs** — ✅ *shipped* (buy via econ; equip/bag-swap via the locker below).
- **GS-story-gear** — ✅ *shipped*: effect-bearing glove/cap/shoes/ball in the Pro Shop, folded at tee-off (Story-only). Cursed-relic pass is later.
- **GS-story-locker** — ✅ *shipped*: campaign locker — bag builder (equip/unequip owned clubs, ≤14) + gear slot-switch, every item tappable → lore card. Caddy roster waits on a caddy shop.
- **GS-story-gear** — equippable gear WITH effects (gloves/hat/shoes/bag) via `PlayerLoadout` no-op-default fields; the **cursed sheddings** (power + a curse) vs Warden grace; Inventory screen.
- **GS-story-ships** — ✅ *shipped*: spaceport Shipyard — buy/fly the fleet; a scattering of acquisition (buy/milestone/ace/secret) + a credit-earning bonus per ship; every ship → lore card.
- **GS-story-ship-upgrades** — ✅ *shipped*: the outfitting bay — weapons/engines/shields raise a Combat Rating (finale-battle prep, the Parrot nags), engines also give a live credit bonus; every upgrade → lore card. The finale reads combatRating.
- **GS-story-locker** — Story locker/wardrobe variant + per-character equipment screen + caddy roster (hire→keep→choose, no fire).
- **GS-story-map** — worlds gain locked/unlocked/cleared states; chapter-gated unlocks; difficulty-scaled world choice.
- **GS-story-tournament** — ✅ *framework + winnable trunk shipped*: one Galaxy Tournament per chapter (unlock by clearing chapter worlds) → beat the rival (Venoma, scaled ghost) → Sigil → chapter advances → next worlds unlock; 5 Sigils = the KEY. Clubhouse banner → lobby → win/lose recap. Deferred: qualifier→final two-round shape, Coil faction row, richer host/rival beats.
- **GS-story-chapters (alignment fork)** — ✅ *shipped*: **The Choice** after Ch.3 (Warden vs Herald, sets `alignment`); Ch.4–5 are per-path tournament variants (Warden redeem Venoma / Herald crush Penelope + Driver Dan); the finale ending branches (Reseal / Long Rest). Deferred: Sigil-less mid-chapter per route, Gemini-Ice side world.
- **GS-story-route-rewards** — ✅ *shipped*: cursed sheddings (Herald: big power + a real curse, cheaper) vs Warden grace (clean, dearer), route-gated in the Pro Shop; route ships (Radiant Warden Cruiser / Coil Wyrm-Ship) granted by winning the route's Ch.4 major. Deferred: wyrm-ship battle-frailty nuance.
- **GS-story-midchapter** — ✅ *shipped*: the Sigil-less emotional interlude after the Ch.4 major — Warden "The Prism Accord" (win a fallen friend back) / Herald "The Severing" (betray one for the Coil's blood-money); a real roster golfer as the friend, fires once, colour-coded dialogue + credit outcome.
- **GS-story-yggdrasil** — ✅ *shipped*: the Jörmungandr SPACE BATTLE — five Sigils forge the key → briefing (two readiness gates: firepower/defence, spends Combat Rating) → Canvas battle cinematic (Cthulhu-serpent + golf finisher) → victory (`completed` → storyComplete → Star Tour) / defeat (arm up, rematch). Deferred: two alignment endings, interactive finisher shot.
- **GS-story-beats** — ✅ *shipped* (the inter-chapter dialogue): four escalation beats through the DATA-driven lore machinery (`LoreContext` gained `storyRound`/`storyChapter`/`storyAlignment`) — the Parrot names the Coil (Ch.2), Coilkeepers ring the tee (Ch.3), Venoma confronts you from Ch.4 branching Warden/Herald. Two bespoke SVG portraits (viper-woman Venoma, faceless Coilkeeper). Story-round-gated (never fires in Voyage/Unending), once-only via `seenLore`. Remaining: the Parrot BAR interaction (tap → chatter) + the cross-chapter difficulty/economy balance pass.

**Run structure & meta**
- **GS-encounters** — branching StS-style node map (elite / driving-range buff / treasure / shop / boss)
  over today's fixed voyage track. The format + boss layer is its foundation.
- **GS-contracts** — optional per-stop objectives ("eagle a hole → free relic", "4 GIR → +50% credits"):
  a pure scoring read over `PlayedHole[]` + an intro-splash card.
- **GS-meta-unlocks** — spend shards on CONTENT (new golfers/caddies/club sets/biomes/relics), not just
  permanent stat upgrades — so the meta adds variety, not only power.
- **GS-risk-shards / GS-bag-cap** (small) — reward `cutDelta`/rarity-survived in shards; a soft bag cap so
  club loot is a draft, not pure accretion.
- **GS-100 follow-ons** — shot-by-shot boss ANIMATION on the map (honour-gated away-player sequencing);
  a matchplay/boss cadence for the endless Unending Universe (voyage-only today); headless
  `simulateRun` playing the real duel (stroke-play today, for balance/tests).
- **GS-fuel follow-ons** — the OVERDRIVE jump (pay extra ⛽ to deepen a lane's jump +1: a real depth
  throttle, but it bends the voyage's `maxJump` fairness cap + the wildness ramp, so it needs its
  own balance pass); a fuel-flavoured unique showpiece (a great tanker armada, arc 3, once per run).
- **GS-unending follow-ons** — tune the birdie wall from real play (hole 41+ demands birdie-or-better;
  baseline auto-AI dies ~hole 24, so 60/80/100+ are meant to need a stacked build — verify a maxed human
  can actually reach 150); per-tier intro stingers ("the bar tightens…"); an endless leaderboard
  (best-holes daily); maybe a mercy token (one bar-miss forgiven) as a deep shop legendary.

**Course / greens / hazards**
- **GS-greens-4** — template green COMPLEXES on top of the linear `greenSlope`: redan kick-feed, Biarritz
  swale, punchbowl gather, crowned/turtleback shed, false-front reject, two-tier. GS-green-contour-2
  built the foundation (shared `sim/contour.ts` field + local-field roll + topo-isoline art) —
  a template complex is now "author the lobe set", no new machinery.
- **GS-contour-fairways** — contoured FAIRWAYS on the same field: a `Hole` lobe set over the corridor
  feeding `sim/contour.ts` (`slopeFieldAt`/`heightFieldAt` are already surface-agnostic) so fairway
  run-out kicks off mounds and gathers in hollows, drawn by the same `render/contour.ts` isolines.
  Physics retune (every seeded landing moves) — own PR, re-run the death-spiral harness; consider
  kick-plates on dogleg corners as the first authored use.
- **GS-variety-3-followup** — the bigger levers from the hole-design research
  (`reports/hole-variety-research-2026-07-08.md`) not yet built. GS-variety-3 shipped the quick wins
  (straight rises with wildness so deep stops aren't all-bends; drivable par-4s persist; island STORIES
  for void/cetus). Still open, high value: **named TEMPLATE holes** as recognizable set-pieces
  (Redan kick-feed / Cape diagonal carry / Biarritz swale / Short-and-guarded — overlaps GS-greens-4 for
  the green complexes); an **anti-repeat scheduler** (thread the previous hole's shape/length-class/
  dogleg-direction into `chooseTemplate` and bias the next AWAY, so consecutive holes contrast — needs
  prev-hole state threaded through `generateHole`); **angle-of-attack** difficulty (couple the tucked
  pin's side to the fairway side that opens it, so tee-shot PLACEMENT matters, not just power); and the
  research's "difficulty budget" idea (cap the length+bend share, spend the rest on greens/hazards).
- **GS-slope-perks** — abilities that bend the slope rules (backspin check-back uphill, cheaper green-read,
  uphill-magnet). The "until perks exist" caveat in the slope code is the hook.
- **GS-split-fairways** — risky-short vs safe-long alternate fairways (the dogleg-grove machinery is the
  start); centreline-bunker pinch + opposite greenside bunker (open-the-angle).
- **GS-fairway-width-2b (follow-on)** — GS-fairway-width-2 shipped the LAY-UP half (the auto AI reads
  the corridor width and lays up off a genuinely tight driving-zone pinch — position over power). Still
  open: teach the reach-AI to read width for CLUB SELECTION in a chute/thin ribbon (a shorter club's
  tighter cone holds the tight drive), and re-tighten the SPARSE-BAG character death-spiral fences — a
  sparse bag has no club to lay up WITH, so width-reading barely moved them. This half overlaps
  GS-rough-gradient-rebalance (richer starter bags / a general play-back-to-the-fairway reach-AI); do
  them together.
- **GS-rough-gradient-rebalance** — the balance half of GS-rough-gradient (shipped: heavy rough hugs the
  fairway + a distance-graded forest at all difficulties, real-golf feel first by design). REACH-AI HALF
  DONE (2026-07-15, PR pending): the auto sim now plays POSITIONAL golf out of trouble — `recoveryTarget`
  punches OUT of trees/deep-rough to the nearest reachable fairway (the #1 death-spiral driver: a trees
  lie fed ~60% of pick-ups, and the sim used to aim through the forest since `clearLine` ignores trees),
  and `autoShotPower` dials a genuine chip/punch down instead of always swinging full (the short-game
  stall). Pure, zero-rng, in the SHARED `layupTarget`/exec path so auto ≡ interactive (byte-checked).
  Pulled the worst sparse-bag max-wildness bar ~1.27→~1.07 toPar and ~20%→~12% floor-hits WITHOUT
  softening the rough; the `tests/characters.test.ts` fences re-tightened 1.45/0.25 → 1.15/0.15.
  STILL OPEN: (a) the full-bag `TODO(GS-biome-variety)` hazard-density fences in `tests/{themes,tents}.test.ts`
  (a per-world hazard-layout debt, not this one) and the `TODO(GS-rough-gradient)` `patches.test.ts` fence
  stayed at their relaxed thresholds (the full bag was already fine, ~0.9, so the reach-AI barely moved it);
  (b) the residual sparse-bag gap to the <1.0/<5% ideal is a SHORT-GAME / scoring pass (a sparse bag's
  ~15-yd club gap still misses more greens), never softer rough; (c) the POSITIONAL-golf tax below (making
  the fairway MATTER) is a separate PR. The gradient knobs (per-hole `buffer` character, `forestReach`,
  ring `plantP`, `ROUGH_CHAR_MIN_WILDNESS`) remain the tuning surface.
  PLAYTEST FINDING (2026-07-07) — the core of this rebalance: "clean open rough lets you skip the fairway;
  different-sized clubs are meaningless if you don't have to play the fairway." Today the DEFAULT off-fairway
  lie is plain `rough` at only −10% carry (`shot.ts LIE_INFO.rough`), the punishing lies (fescue −28%,
  deeprough −50%, trees −40%) sit a blob-radius OFF the centreline (the `standoff`), and corridors are wide
  early (`widthScale 2.0−1.25·wildness`), so bombing driver over everything has ~no positional cost and club
  choice never bites. The fix is a POSITIONAL-golf pass (its own PR + death-spiral harness), NOT softening
  rough: e.g. lift the plain-rough carry tax and/or wilds-spray so a miss actually costs a stroke of position,
  place heavy rough/hazard so the aggressive line is genuinely gated, and reward the fairway lie — measured on
  mean per-stop Stableford, contract 4. Do this WITH the reach-AI + starter-bag work above, not before it.
- **GS-more-worlds** — new exotic archetypes, each a new row + its ~14 Record entries (the registry scales).
  SHIPPED (2 of 4): **Toxic Mire** (`swamp`/Hydra) — the HEAVIEST air in the galaxy (the ball flies short),
  still + humid, acid bog everywhere; and **Scrap Belt** (`metal`/Antlia) — the lowest NON-abyss gravity
  (big low-grav bombs + debris jitter) over a solid derelict-metal graveyard (craters + a hull-plate
  chasm carry). They bracket the gravity spectrum (0.88 ↔ 1.32) with maximally-different visuals; both
  clear the death-spiral + fairness harnesses. Remaining: **neon/cyber grid** and **lightning-storm**
  (the latter overlaps Tempest — needs a distinct physical niche, e.g. static-charge scatter or a
  chain-lightning hazard, or drop it). See `reports/new-worlds-swamp-metal-2026-07-10.md`.
- **GS-hazard-vocab** — internal OB, railway-sleeper/bulkhead carom, chocolate-drop mounds, gorse.
- **GS-weather-play** — deeper per-sky gameplay signatures beyond GS-journey-variety's wind hook.
  SHIPPED: meteor-strike scorch lies (GS-meteor-scorch); GS-journey-fx-2 — every effect now carries a
  real hook (carry mult via biomeMods; stardust/ice/junk GROUND PATCHES generalising the scorch
  machinery in `sim/patches.ts`; gravityWell + frostfall skies; ~16 new events; play-consequence chips
  on the route card; machine-checked "no sky ships as pure dressing"). Remaining: collidable junk
  HULKS in the rough (generalize the GS-tents collision the way patches generalized scorch), a
  comet-tail tailwind corridor, eclipse dimming the putt read. Each must stay fair-by-construction and
  thread auto≡interactive exactly like GS-tents did.

**Shot model & clubs**
- **GS-flight-shop** — flight-shaping Pro-Shop gear on top of the per-family flight profiles
  (GS-flight-3): a piercing low-wind driver (apexAt later / peakMult down), a sky-high "drop-anchor"
  wedge set (clears greenside trouble, kills roll), a hybrid that launches over anything. Mechanism
  exists: a `FlightProfile` mod threaded like `ShapeMod` through `flightProfileOf` — items scale
  `peakMult`/`apexAt`, and the aim overlay + knockdown walks read it automatically.
- **GS-clubs follow-ons** — location-specific club SETS with game EFFECTS (not just carry); scoring-club
  upgrade tiers via per-club dispersion/shape (a "tour wedge" that doesn't overshoot); wire reward-club
  acquisition into the cut/credit curve (most runs end before the bag fills today).
- **GS-4b** — smarter recovery/short-game to shrink the rare max-wildness blow-up tail (polish, not a
  blocker — the tail is Stableford-absorbed). NOTE: a naive "club for nearest carry" was tried + REVERTED
  (it reshuffles the RNG stream, didn't shrink the tail). Keep any attempt pure + seeded.

**Engine / codebase health**
- **GS-appsplit** — decompose the `app.ts` god-file (CLAUDE.md flags it as the likeliest regression
  source). Pure leaf clusters are out (haptics, celebrations, golferCards — #157/#158; 3,462 → 2,696
  lines). The rest is `state`-coupled (screens, gesture, `render`, `dispatch`). Next step is
  ARCHITECTURAL — a render context + a golden-HTML snapshot harness first, since the screen HTML is
  currently untested. Plan + staged steps in `reports/app-ts-decomposition-2026-06-30.md`. Do it in a
  fresh, planned session.

## Later
- **GS-5b — Flux biome/boss art.** Card system + art hook shipped (PR #9); needs the image-gen tooling
  (absent in-session) — see `reports/art-pipeline-2026-06-24.md`. Pass `artUrl` to `courseCardHTML` once
  images exist.
- **GS-16b — Hub I2 parity.** Each hook should have BOTH a URL form and a live form; remaining is a URL
  form for the feel flags (`?feel=`/`?spray=`) + a live no-reload seed/intro helper.
- **GS-mux deferred** — landscape/tablet layout, first-run coaching coachmarks, a putt drag-back gesture
  (the pace meter stands), per-club/character personality surfaced in the UI, multi-touch eyes-on of
  pinch-zoom. (Any new feel knob must add its test-hub control in the same PR — the I4 rule.)

## Done
Terse log — full story in the linked report / `docs/decisions/` / git history.
- **GS-weather-affinity** — soft thematic weather↔biome bias: a weathered lane (blizzard/dust storm/…)
  now leans toward a fitting world (`EFFECT_BIOME_AFFINITY` + a `pickThemeFrom` weight boost on
  `routeTheme`'s own stream — same draw count, `:routes:` byte-identical, affinity-less skies unchanged).
  Weather stays event-driven + biome-independent; this only nudges WHICH world a weathered lane reaches.
  Also arc-spread the two new worlds (added Piscis Austrinus @swamp + Pyxis @metal, 6★/arc 2) so neither
  is locked to one arc's skies. `docs/decisions/rpg-meta-loop.md`.
- **GS-fairway-width-2** — the auto AI now READS the width grammar: a positioning drive that would come
  down in a genuinely tight driving-zone pinch lays up to the wider bay short of it (`widthLayupTarget`/
  `corridorHalfWidthAt` in `round.ts`, inside the shared `safeTarget` so auto ≡ interactive; pure, zero
  rng). Gated LOW so it fires only on brutal deep-stop corridors — RAISES mean per-stop Stableford
  (contract 4) and improved the max-wildness BIOMES bar (`toPar/hole` 0.78 → 0.77, floor-hit 7.55% →
  7.36%). Re-tightened the biomes floor-hit + themes `toPar` fences the rough-gradient had relaxed.
  Club-selection width-reading + the sparse-bag rebalance remain (GS-fairway-width-2b /
  GS-rough-gradient-rebalance). See `docs/decisions/sim-generator.md`.
- **GS-fuel-4** — fuel earns agency: the lane's SKY prices the passage (solar-wind/comet tailwinds
  −1 ⛽, gravity-well/ion-storm headwinds +1 ⛽ — burn decoupled from distance, derived + zero rng),
  tanker events refuel on arrival (scow/derelict/caravan, arc-tiered), and the SECTOR SCAN burns
  fuel to redraw the three lanes (escalating price, never the last cell, resume-safe via
  `Run.routeScans`, save v19) — doubling as the stranded lifeline. See
  `docs/decisions/rpg-meta-loop.md`.
- **GS-fuel-3** — build hooks on the GS-fuel-2 fuel economy: Ion Thrusters (epic; every jump −1 ⛽,
  min 1, and the journey-map ship trails a luminous ion wake), Reserve Fuel Tank (rare; +4 capacity,
  arrives full via the one-shot `ShopItem.fuelBonus` grant in `buy`), and the eagle siphon (a holed
  eagle-or-better refuels one cell in `finishStop` — great golf extends the journey; never on warp).
  See `docs/decisions/rpg-meta-loop.md`.
- **GS-intro-split** — the stop briefing is two mobile steps instead of one long scroll: step 1 the
  ARC (mode + win condition + the field of 20 competitors, "First Tee ▸" top + bottom-on-overflow +
  "Change golfer"), step 2 the HOLE (viewport-fit map + tap-to-open hazards/benefits popup + Tee Off
  / Watch AI / Back). One `'intro'` reducer screen toggled by view state (`introStage`), reset on
  entry; new `backToCharacter` action; zero save/rng. See `docs/decisions/ui-intro.md`.
- **GS-audio-4** — caddy-guard projectile cues: the Space Ducks laser PEWs on launch (beam whine
  rising into the ball) and SNAPs on contact; the Convict Sheep boomerang whooshes + whirs
  (whip-whip pulses quickening across the flight) and CRACKs wood-on-ball with a wobbling ring.
  Fired via a pure `onRedirect(kind, phase, travelMs)` feel hook at the redirect cinematic's own
  fire/spark beats; `travelMs` folds in the slow-mo so the whir ends exactly at the hit. Zero
  sim/rng impact; call-clean headless contract pinned (`tests/audio.test.ts`). See
  `docs/decisions/audio.md`.
- **GS-audio-3** — hazard & tree landing voices: the touchdown answers in sound (the audio half of
  `spawnLandFX`) — water splash, lava sizzle, void implosion, cetus whale song, ravine rockfall,
  sand/ice/crystal/scorch/stardust/junk — and tree hits are voiced per world archetype off the
  flora table (crystal spires ping, fungal mushrooms squelch, parkland knocks wood, saguaros tonk…).
  Pure `onLand` feel hook + pure classifiers (`landVoiceOf`/`treeVoiceOf`), zero sim/rng impact,
  coverage machine-checked (`tests/audio.test.ts`). See `docs/decisions/audio.md`.
- **GS-audio-2** — sound-design pass: club-FAMILY strike voices (driver boom+ping / wood / hybrid /
  iron click / wedge turf-shhk), a real ball-in-cup drop (rim knock → rattle → thunk → confirm), and
  an assetless GENERATIVE music layer — a distinct ambient track per world archetype + a menu lull,
  behind its own Music setting; coverage + the ≤0.35 subtlety gain bar machine-checked
  (`tests/audio.test.ts`). See `docs/decisions/audio.md`.
- **GS-journey-variety** — the three journey lanes always land distinct world archetypes (never the one
  you're on; split stops cross two archetypes); four new skies (eclipse / ion storm / nebula / comet) with
  real showpiece visuals + junk/trade-camp upgrades; the `effectWindMult` play hook makes weather bite
  fairly (storms gust, eclipses go still — HUD/AI/sim read the same wind). See
  `docs/decisions/rpg-meta-loop.md`.
- **GS-biome-feel** — per-world identity pass (supersedes GS-canopy-recolour): archetype flora (mushrooms/
  conifers/snags/saguaros/spires/palms…), signature ground decor (void asteroids + black hole, inferno
  fissures, ocean surf + cays…), themed OB markers (void warp beacons), per-surface landing FX (splash/
  lava burst/void implosion), ambient air layer + full 10-world wind tints. See `docs/decisions/render.md`.
- **GS-journey-alive** — journey select as a living cockpit: lit-sphere biome worlds (gradient body +
  surface art + terminator + specular + atmosphere), boss red-aura / heat shimmer, warp-corridor energy
  pulses, trail comet, launch-pad + thrusters, lit Earth, seeded twinkles/shooting stars, drifting sky.
  Byte-stable (seeded mulberry32, no Math.random). See `docs/decisions/rpg-meta-loop.md`.
- **GS-appsplit (partial)** — extracted haptics + celebrations (#157) and golfer avatars/leaderboard views
  (#158) out of `app.ts` (3,462 → 2,696 lines). Ongoing — see Now/next.
- **GS-tents** — trade-market route pitches collidable tents around the green (#155).
- **GS-rainbow** — legendary Rainbow Ball: every hole becomes Rainbow Road (#150).
- **GS-cetus** — star-ocean clifftop whale world + island-green par-3s (#152, reworked in GS-cetus-2;
  GS-cetus-3 made it read side-on: render-only dropdown cliff faces + a river of stars with a source
  spilling over the cliff into the starscape ocean, top-down play/aim projection kept untouched).
- **GS-team-duel** — Arc-II boss as a rank-based best-ball/scramble team duel (#147).
- **GS-proshop-2/3** — Pro Shop expansion: themed gear/club sets, bespoke caddy portraits, equal-size
  rarity-glow cards, Power Glove + gear inventory (#140/#141/#148).
- **GS-garage** — Trade Market + Garage: Star Shards buy cosmetic ships; permanent stat upgrades retired (#139).
- **GS-journey-fx** — route choice materially shapes the next course; shared animated screen-space weather (#138/#146).
- **GS-bird** — eagle & albatross fly-over celebrations (#145).
- **GS-greens-3** — green slope + putting break; Mystic Mole green reader (#133/#134).
- **GS-shapes-2 / GS-hazards-2 / GS-worlds / GS-rarity-style** — course-variety pass: hole archetypes;
  pot/fescue/barranca + length-tied greens; four new worlds (crystal/tempest/fungal/ocean); distinct
  rarity reads (#129–#131; `reports/course-variety-pass-2026-06-29.md`).
- **GS-100 / GS-competition** — field of AI golfers, live leaderboard, positional cut, matchplay bosses
  (#100–#104; `reports/competition-golfers-leaderboard-2026-06-28.md`). GS-rival merged in (the field IS the rival).
- **GS-boss/voyage · GS-scramble · GS-variation · GS-ascension · GS-synergy/curses/shop-reroll** — the
  roguelike-loop overhaul: winnable Voyage (arcs + bosses), co-op scramble bosses, multi-biome split stops,
  8-tier ascension, trigger relics + Glass Cannon curse + shop reroll (PR #82;
  `reports/gameplay-loop-review-2026-06-28.md`).
- **GS-routes / GS-14** — risk/reward travel: four trade-off levers, per-arc event slots, ~26+5 themed
  events, SVG starmap (economy/cut only). Triple-legendary easter-egg noted for an achievements system.
- **GS-clubs / GS-caddy / GS-caddy-sam** — per-character starting bags + clubs as loot; named-caddy card set
  (hire one); Suggestible Sam gates the club-suggestion + a confidence edge.
- **GS-19** — themes & fairways overhaul: per-archetype turf, void lost-rough, lava rivers, zone splash.
- **GS-17 (+b/c/d/e/f/g)** — star-travel theming end-to-end: theme table, rarity-tiered biomes, split events,
  rendered constellations, themed upgrades, Sim Lab theme browser (`reports/star-travel-theming-2026-06-26.md`).
- **GS-dispersion-2** — asymmetric 5-zone spray model + zone/distance upgrades
  (`reports/dispersion-graphic-upgrades-2026-06-27.md`).
- **GS-16** — test/demo hub + Sim Lab + auto-discovering CI hook-sync guard.
- **GS-15** — play-loop UX + mechanics: angular dispersion, zoom/follow-cam, green-coverage club, free-aim.
- **GS-bank** — push-your-luck cash-out (bank unspent credits → shards on a banked run).
- **GS-mux (largely)** — mobile UX: WebAudio engine, haptics, settings sheet, lie chip, fast shots,
  aim/zoom gestures, Daily Challenge seed (GS-7), install nudge, Sandy + Mystic Mole caddies
  (`reports/mobile-ux-review-2026-06-28.md`).
- **GS-13** — treelines, fairway bunkers, visible OB (`tests/hazards.test.ts`).
- **GS-12** — persistent meta: Star Shards + Outpost (save v3).
- **GS-11** — deep shop: stackable upgrades + rotating rarity-weighted offer.
- **GS-10** — RPG shot model + interactive play (#18–#21).
- **GS-unending** — the Unending Universe endless survival format (4-hole stops forever, par-relative
  per-hole bar, milestone victory screens + the earn-only Evergreen set + the secret hole-150 ship;
  replaced the flat/ladder roguelites; save v13).
- **GS-9** — run formats: flat + ladder (#8; both retired by GS-unending).
- **GS-8** — interactive meta-loop UI reducer (#5).
- **GS-6** — real pin within the green.
- **GS-5** — course/item cards (#9).
- **GS-3** — Canvas2D play view + ball flight (#4).
- **GS-2** — RPG meta-loop sim layer (#3).
- **GS-1** — wildness & biome system (#2).

## Dropped
- _none yet._ Cautionary "tried & reverted" notes live with their code, not here: the OB-margin tightening
  and the naive nearest-carry club-AI were both reverted (they tipped the death-spiral bar / just
  reshuffled RNG) — see `docs/decisions/sim-generator.md`.
