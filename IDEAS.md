# Golf Stars — idea backlog

Living doc (per CLAUDE.md): scan, rerank, merge, retire — **not append-only.** This file tracks **open
work**. Stable IDs, never reused. When something ships it collapses to a one-line **Done** entry (link the
PR/report); the full story lives in `reports/` + `docs/decisions/` + git, never here. Bad → **Dropped** (say why).

## Avenue decision (open)
What wraps the golf — three non-exclusive avenues: (1) **full top-down RPG** (overworld/narrative shell
*around* the loop) — deferred until the golf + run shape are locked; (2) **roguelite** (`flat` format) —
current; (3) **escalating ladder** (`ladder` format) — shipped selectable (GS-9) so 2-vs-3 can be *played*.
Everything below serves whichever wins.

## Now / next
Foundations are shipped; these are the live follow-ons.

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
  matchplay/boss cadence for the endless `flat`/`ladder` formats (voyage-only today); headless
  `simulateRun` playing the real duel (stroke-play today, for balance/tests).

**Course / greens / hazards**
- **GS-greens-4** — template green COMPLEXES on top of the linear `greenSlope`: redan kick-feed, Biarritz
  swale, punchbowl gather, crowned/turtleback shed, false-front reject, two-tier. Likely a per-region
  slope field + an approach settle-trickle.
- **GS-slope-perks** — abilities that bend the slope rules (backspin check-back uphill, cheaper green-read,
  uphill-magnet). The "until perks exist" caveat in the slope code is the hook.
- **GS-split-fairways** — risky-short vs safe-long alternate fairways (the dogleg-grove machinery is the
  start); centreline-bunker pinch + opposite greenside bunker (open-the-angle).
- **GS-canopy-recolour** — per-world tree/canopy palette (`CANOPY` is one fixed green today) so fungal reads
  as mushrooms and crystal as spires, not foliage.
- **GS-more-worlds** — metal/asteroid (low-grav scrap), neon/cyber grid, toxic/acid swamp, lightning-storm:
  each a new archetype row + its 8 Record entries (the registry scales now).
- **GS-hazard-vocab** — internal OB, railway-sleeper/bulkhead carom, chocolate-drop mounds, gorse.

**Shot model & clubs**
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
- **GS-journey-alive** — journey select as a living cockpit: lit-sphere biome worlds (gradient body +
  surface art + terminator + specular + atmosphere), boss red-aura / heat shimmer, warp-corridor energy
  pulses, trail comet, launch-pad + thrusters, lit Earth, seeded twinkles/shooting stars, drifting sky.
  Byte-stable (seeded mulberry32, no Math.random). See `docs/decisions/rpg-meta-loop.md`.
- **GS-appsplit (partial)** — extracted haptics + celebrations (#157) and golfer avatars/leaderboard views
  (#158) out of `app.ts` (3,462 → 2,696 lines). Ongoing — see Now/next.
- **GS-tents** — trade-market route pitches collidable tents around the green (#155).
- **GS-rainbow** — legendary Rainbow Ball: every hole becomes Rainbow Road (#150).
- **GS-cetus** — star-ocean clifftop whale world + island-green par-3s (#152, reworked in GS-cetus-2).
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
- **GS-9** — run formats: flat + ladder (#8).
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
