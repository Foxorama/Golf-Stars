# Course / biome / hazard variety pass — 2026-06-29

A deep pass making the golf courses, biomes and hazards fun, interesting and unique (the "every hole
plays the same, biomes are recolours, greens are identical" complaint). Grounded in fresh golf-design
research (`reports/golf-design-research-2026-06-29.md`). Shipped as four merged PRs.

## What shipped
- **GS-shapes-2 — hole archetypes (#129).** A template grammar coupling SHAPE × LENGTH: heroic **cape**
  (early bite-off corner), severe **hairpin**, plus the existing straight/dogleg/S — and real length
  variety within a par: **drivable** par-4s, long/stout par-4s, short-pitch / long-iron par-3s,
  reachable vs three-shot par-5s. `Hole.shapeId` + a play-HUD label (🌊 Cape / ↩ Hairpin / 🏌 Drivable).
- **GS-hazards-2 — hazard & green variety (#130).** Deep **pot** bunkers (landing-zone pinch nests +
  greenside rings, the encircled "Short" look), thick **fescue** native rough, dry **barranca** ravine
  forced-carry crossings, and green **size now tracks hole length** (par-3 small, par-5 big).
- **GS-worlds — four new exotic worlds (#130).** **crystal** (Prism Reach — true/fast crystal, precision
  rewarded), **tempest** (gas-giant gale — the windiest), **fungal** (Spore Jungle — densest groves +
  stream carries), **ocean** (Tidal Archipelago — sea-channel carries + lagoons). Fully wired through
  physics/palette/zone+Pro/hero art/wind/badges/talent/champions; surfaced by 8 new real constellations.
- **GS-rarity-style — rarity reads as distinct finds (#131).** A render-only rarity deepen (bolder than
  the physics intensity, decoupled so balance is untouched) + a zone-splash rarity ribbon/tagline.

## Balance posture
Per the user's steer ("prioritise fun over safe/balanced; tune later"), difficulty was pushed up
(longer holes, denser/new hazards, windier worlds) but kept **inside the no-death-spiral bars** so CI
stays green — every bar across all biomes & themes at max wildness still holds. The auto reach-AI is a
deliberately weak floor; interactive play has far more headroom. Eyeballed via the biome gallery — the
four new worlds read as genuinely distinct, and the varied hole shapes/hazards are visible.

## Biggest remaining gap (next pass)
**Greens still play as a flat blob** — shape varies, but there's no slope/tier mechanic. The highest-value
follow-up is real template-green COMPLEXES (Redan kick-slope feed, Biarritz swale, punchbowl gather,
crowned/turtleback shed, false front reject, two-tier greens modelled as a lag/dispersion penalty).
See the IDEAS.md backlog for the full list (split fairways, strategic bunker pinch, per-world canopy
recolour, more worlds, internal OB / carom hazards).
