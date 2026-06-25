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

## Done
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
