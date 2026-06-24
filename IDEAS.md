# Golf Stars — idea backlog

Living doc (per CLAUDE.md): scan, rerank, merge, retire — not append-only. Stable IDs, never
reused. Shipped → Done (link PR); bad → Dropped (say why).

## Now / next (the slice is done — these are the natural follow-ons)

- **GS-1 — Wildness & biome system.** Turn the generator's `wildness`/`biome` knobs into real
  content: biome-specific surfaces (lava/crystal/void/antigrav as `Feature.kind` + a `LIE_INFO`
  row + a `biomeMods` carry/dispersion modifier). The contract already carries `biomeMods`; nothing
  in the engine changes, only data rows. *(The kit's "then start the real work" item.)*
- **GS-2 — RPG meta-loop.** `src/sim/rpg/run.ts` + `economy.ts`: travel → arrive (rarity-graded) →
  play → reward → spend on clubs/perks → travel further, difficulty scales. Define currency, what
  persists vs resets, and the fail/end state before building screens. Wire it through the save.
- **GS-3 — Canvas2D play view + ball flight.** The static map is SVG (`holeView.ts`); the *animated*
  swing/ball-flight/juice layer is Canvas2D per the architecture decision. Drive it off the same
  `ShotLog[]` the round sim already produces.
- **GS-4 — Real putting model.** `round.ts` currently lags+holes with a coarse distance model.
  Replace with green slope/break once greens carry contour data; keep it pure + seeded.

## Later

- **GS-5 — Course/item cards.** Port `buildCard` + rarity tint (`RARITY_C`) for "course discovered"
  and loot cards. Flux art pipeline for biome/boss art (CLAUDE.md "Art pipeline").
- **GS-6 — Pin ≠ green centroid.** Generate a real pin position within the green polygon; the round
  sim already targets `pin(hole)`, so it's a one-function change.
- **GS-7 — Daily challenge seed.** RNG already accepts string seeds (`hashSeed`); a daily is just
  `new Rng('daily-YYYY-MM-DD')`.

## Done
- _none yet_

## Dropped
- _none yet_
