# Star-travel themes — design & roadmap (GS-17)

_2026-06-26 — import golf-finder's night-sky catalogue as the thematic basis for star travel,
course theming, events, and upgrades._

## The ask

Import the harvested night-sky catalogue (`data/night-sky-cards.json` — 28 constellations, 17
deep-sky objects, 2 naked-eye galaxies, planets, and events) and use it to:

- theme each golf course by the constellation/galaxy/event it flies into,
- organise destinations into **three progression arcs**,
- treat **one-off dated events as unique** events and **recurring events as the roguelike backbone**,
- let the active theme seed random events and skill/club/other upgrades.

## Locked design decisions

1. **Arc gating = constellation star count, rebalanced.** The literal "1–4 / 5–6 / 7+" left arc 1
   with only 3 themes (repetitive early game). Rebalanced to **≤5 / 6–7 / 8+** → a clean **9 / 10 / 9**
   constellation split. Deep-sky/galaxy showpieces have no stick figure, so they're gated by
   **rarity** instead (rare → arc 2, epic → arc 3); the two naked-eye galaxies are pinned to arc 3.
2. **New biomes, rarity-scaled.** Rather than reuse the 5 biomes flatly, the biome a theme generates
   should **feel its rarity** — a legendary inferno reads wilder/grander than a common one. This is
   the bigger lift and is sequenced as slice **GS-17b** (see Roadmap); slice A maps archetypes onto
   the existing 5 biomes so the foundation ships balanced first.

## Mapping (catalogue → game)

| Catalogue layer | Game role | Where |
| --- | --- | --- |
| 28 constellations | Recurring course **themes** (the backbone) | `src/sim/course/themes.ts` |
| 17 deep-sky + 2 galaxies | Rare **destination themes** (showpiece stops) | same |
| 5 one-off dated events | **Unique events** (≤1 per run) | GS-17c (events.ts) |
| meteor showers / moon / oppositions / season markers | **Recurring event** flavour over the `RouteEvent` levers | GS-17c |

Each theme carries `{ id, name, kind, rarity, arc, stars?, archetype, anchor, blurb, unique }`. The
**archetype** (`verdant | desert | frost | inferno | void`) is the single seam that selects the
biome (`archetypeBiome`), so the biome layer can be re-tiered (GS-17b) without touching the table.

## What shipped in this slice (GS-17a — foundation)

- `data/night-sky-cards.{json,md}` + `.extract.mjs` — the catalogue committed as the regenerable
  source of record (NOT imported by the sim; the curated `themes.ts` is the sim-facing table).
- `src/sim/course/themes.ts` — the curated theme table + arc keys (`arcForStars`, `arcForDistance`),
  the archetype→biome resolver, and a rarity-weighted `pickTheme` / `themeForStop`.
- Wiring: `currentCourse` (run.ts) now selects the stop's theme (seeded `:theme:` stream → no
  perturbation of existing streams) and generates from the theme's biome, tagging `course.meta.themeId`.
  `StopResult.themeId` surfaces it to the UI/tests. `Course`/`generateCourse` gained an optional
  `themeId`.
- `tests/themes.test.ts` — arc split (9/10/9), determinism, rarity scarcity, biome resolution, and a
  re-proof of the no-death-spiral bar under theme-forced biomes.

### Balance note

Theme selection forces the biome per stop (vs. the old blind `pickBiome`), which shifts the seeded
score stream. Re-validated: the `biomes.test.ts` no-death-spiral loop and `run.test.ts` mean-Stableford
guard stay green; `tests/themes.test.ts` re-asserts `toPar/hole < 1.0` and blow-ups < 5% across a
multi-arc walk. (Knock-on test seeds updated: `ui.test.ts` missed-cut seed 14 → 26; `formats.test.ts`
flat-stop determinism now compares against the same theme.)

## What shipped next (GS-17b — rarity-tiered, theme-flavoured biomes)

Each theme now resolves to a concrete biome that PLAYS its character, not just its archetype:

- `BiomeFlavour` (bounded multipliers: carry/jitter/wind/tightness/dogleg/trees/bunkers/scatter) on
  every theme row — Scorpius's hooking sting (dogleg ↑, bunkers ↑), Sagittarius's black-hole gravity
  (carry ↑, jitter ↑), the Milky Way core's grandeur, a sail's crosswind, a wolf's dense treeline.
- `RARITY_INTENSITY` amplifies the flavour DEVIATIONS by rarity, so a common inferno plays plain and
  an epic one reads wilder — "rare feels rare, legendary feels legendary".
- `resolveBiome(theme)` composes archetype × flavour × rarity and CLAMPS every field to a fair range;
  the generator consumes it via a new `biomeRow` option. Biome `id` stays the archetype, so the 5-key
  render palette still resolves (per-theme VISUALS are GS-17e; the course already carries `themeId`).
- Fairness: flavour only turns up NON-penalty spice; penalty hazards are still kept off the corridor
  by `validateFairness`. `tests/themes.test.ts` re-proves the no-death-spiral bar across EVERY theme
  at max wildness, asserts the clamps, and asserts rarer themes are measurably more intense.

## What shipped next (GS-17c — event split)

Route events re-themed from the catalogue and split into the two kinds the original vision asked for:

- **Recurring backbone** (`ROUTE_EVENTS`) — meteor showers, moon phases, flares, tailwinds, aurora —
  now `minArc`-tiered so they **accent the arcs**: calm drifts and full moons early; solar flares,
  oppositions and the aurora jackpot only in the deep arc.
- **Unique one-offs** (`UNIQUE_EVENTS`) — the catalogue's dated showpieces (penumbral/partial/total
  eclipses, a comet apparition, the Apophis flyby): the richest, deadliest lanes, gated to arc 3 and
  offered **at most once per run**. The run tracks `firedEventIds` (round-tripped in the snapshot);
  `eventPool(distance, fired)` tiers the recurring events in and drops spent uniques.

Still economy/cut-only — `creditMult` + `cutDelta`, never course generation — so the fairness +
no-death-spiral validators stay untouched, and every jump still guarantees one calm "out".

## Roadmap (remaining slices)
- **GS-17d — Themed upgrades.** Bias the shop/meta draw by the active theme's flavour so clubs/perks
  read on-theme for the arc you're in.
- **GS-17e — Render the constellation.** Draw the theme's actual stick figure (stars + `lines` from
  the catalogue) as the course sky backdrop in `buildScene`, rarity-tinted; wire the theme into the
  Sim Lab + Demo hub (the only piece the test-hub guard will want once a hook appears).

## Fairness boundary (do not cross)

A theme SELECTS the biome and FLAVOURS the stop; it never edits hole generation, and events stay pure
economy/cut levers. That is what keeps `validateFairness` + the no-death-spiral validators untouched.
A "wilder course" event would re-open both bars — out of scope unless explicitly chosen.
