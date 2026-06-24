# Golf Stars — idea backlog

Living doc (per CLAUDE.md): scan, rerank, merge, retire — not append-only. Stable IDs, never
reused. Shipped → Done (link PR); bad → Dropped (say why).

## Now / next (the slice is done — these are the natural follow-ons)

- **GS-8 — Interactive meta-loop UI.** The sim spine (GS-2) is headless; build the screens —
  click a route, open the shop, play a stop, see the cut result — driven by `startRun`/`playStop`/
  `travel`/`buy`. Wire it through the save (`snapshotRun`/`resumeRun`, the v2 schema). Also: smarter
  auto-pilot route choice (currently always route 0) for balancing.
- **GS-3 — Canvas2D play view + ball flight.** The static map is SVG (`holeView.ts`); the *animated*
  swing/ball-flight/juice layer is Canvas2D per the architecture decision. Drive it off the same
  `ShotLog[]` the round sim already produces.
- **GS-4 — Real putting + short-game model.** `round.ts` currently lags+holes with a coarse
  distance model, and the recovery AI can still post rare blow-up holes at max wildness. Replace
  with green slope/break (once greens carry contour data) and a smarter short game (controlled
  shots from bad lies) to shrink the blow-up tail. Keep it pure + seeded.

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

## Dropped
- _none yet_
