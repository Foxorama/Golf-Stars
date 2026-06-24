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

- **GS-5 — Course/item cards.** Port `buildCard` + rarity tint (`RARITY_C`) for "course discovered"
  and loot cards. Flux art pipeline for biome/boss art (CLAUDE.md "Art pipeline").
- **GS-6 — Pin ≠ green centroid.** Generate a real pin position within the green polygon; the round
  sim already targets `pin(hole)`, so it's a one-function change.
- **GS-7 — Daily challenge seed.** RNG already accepts string seeds (`hashSeed`); a daily is just
  `new Rng('daily-YYYY-MM-DD')`.

## Done
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
- **GS-8 — Interactive meta-loop UI.** Pure screen-flow reducer (`ui/game.ts`) over the run API:
  intro → play → result (animated + scorecard) → shop → travel → repeat → gameover. Save/resume
  via the v2 schema. Reducer fully tested through a playthrough; click-through feel needs eyes-on.
  (PR #5). Follow-on left open: smarter auto-pilot route choice for balancing.

## Dropped
- _none yet_
