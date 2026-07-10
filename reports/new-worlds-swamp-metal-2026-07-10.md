# Two new worlds: Toxic Mire + Scrap Belt (GS-more-worlds) — 2026-07-10

Shipped the first two of the GS-more-worlds backlog items, chosen to **bracket the gravity
spectrum** and be maximally distinct from the existing ten worlds (per the request: "different and
unique enough to be worth adding… increase diversity, not copy-paste").

## The two worlds

### Toxic Mire — archetype `swamp`, biome `toxic-mire`, theme **Hydra** (arc 3, 17★)
The **heaviest air in the galaxy** — the opposite end from every low-gravity belt. `carryMult 0.88`
(vs inferno's 0.95, the previous heaviest), so the ball flies *short*. This is FAIR by construction:
`generate.ts:768` scales hole LENGTH by `carryMult`, so holes shrink to match and every carry stays
carry-relative — the auto-AI reaches exactly as it does elsewhere. The signature is the murky,
water-choked, dead-mangrove character, not an unfair reach:
- Still, muggy, almost windless (`windBase 1 / windWild 6`) — the inverse of Tempest/Ocean.
- Acid pools & mires everywhere (ordinary penalty `water`), a `waterCreek` acid-channel crossing,
  flanking `ponds 1.7`, greenside acid pools (`greensideKind 'water'`) — all proven-fair mechanics.
- A boggy reed/bramble `deeprough` cut (never `water`, to avoid a heavy-air forced carry), dense
  `fescue 1.3` reeds, winding corridors (`doglegBias 0.42` — the Water-Serpent's coils).
- Soft, waterlogged, low-tilt greens.

### Scrap Belt — archetype `metal`, biome `scrap-belt`, theme **Antlia** (arc 1, 4★)
The **lowest playable gravity** (`carryMult 1.32` + `carryJitter 0.06`) — everything bombs and
tumbling debris jostles the carry — but played over SOLID derelict metal, NOT an abyss (the
distinction from the void: no lost-rough, no island-hop). A machine graveyard:
- Blast-crater bunkers (`craters 2.0`), scrap-waste bands (`fairwayBreaks 1.0`), a hull-plate chasm
  crossing (`barranca true`), a rebar/scrap `deeprough` — all proven-fair (craters/waste sand + a
  sanctioned barranca carry, exactly like the Dust Belt), so it clears the death-spiral bar despite
  the low gravity (holes lengthen with `carryMult`).
- Near-vacuum calm (`windBase 2`), riveted scrap-plate scatter lies (`waste`), sparse rusted-mast
  "trees", angular plate-metal greens.

Neither is `BALANCE_EXEMPT` — both face and pass the full death-spiral + fairness harnesses.

## Every touchpoint wired (a new archetype = a new row + ~14 Record entries)

**Sim / physics / meta**
- `sim/course/themes.ts` — `BiomeArchetype` union + `ARCHETYPE_BIOME` + `ARCHETYPE_AFFINITY` + two
  constellation rows (Hydra 17★→arc 3, Antlia 4★→arc 1).
- `sim/course/biomes.ts` — two physics rows (`toxic-mire` weight 9, `scrap-belt` weight 9).
- `sim/course/zones.ts` — `ZONES` + `PROS` (Murk Bellweather; Rusty Colefax).
- `sim/rpg/golfers.ts` — `CHAMPIONS` (Halden Alphard / Hydra; Axel Antliae / Antlia).

**Render identity**
- `render/palette.ts` — `ARCHETYPE_TURF`, `ARCHETYPE_SPACE`, `OB_LOOK`, `BIOME_ROUGH`, `ACCENTS`
  (rough bases kept ≥30 brighter than space bases — the frame test).
- `render/weather.ts` — `WIND_RGBA`, `AMBIENT` (rising acid-gas; drifting filings + sparks).
- `render/style/effects.ts` — `WIND_COL`.
- `render/music.ts` — `MUSIC_TRACKS` (*Miasma*, phrygian; *Scrapyard Drift*, min-pentatonic — unique
  root+scale+bpm fingerprints).
- `render/audio.ts` — `TREE_VOICES` (swamp reuses wet `squelch`; metal gets a new `clang` voice +
  its `treeSound` composition).
- `render/holeView.ts` — `TREE_GLYPH` (🌾 / 📡).
- `render/golferCards.ts` — `PRO_LOOK`.
- `render/starmap.ts` — `BIOME_LOOK`.
- `render/style/relief.ts` — `BIOME_RELIEF`.
- `render/style/ground.ts` — `GROUND_COVER` (muck+reeds; rust+plate-seams+rebar shards).
- `render/style/hazards.ts` — `DEEP_ROUGH` (the silent-fallback trap: would render verdant-green
  tangle without a row).
- `render/style/flora.ts` — `styleFlora` (dead bog cypress; rusted lattice mast) + `archetypeDecor`
  (bubbling acid pools + gas + sunken logs; scattered hull-plates + drifting debris + a skyline
  ship-wreck + sparks).
- `render/zoneHero.ts` — bespoke hero cards (else they fall back to the void hero).
- `render/sky-coords.ts` — real J2000 coords for Hydra (Alphard) + Antlia.
- `render/constellations.ts` — hand-authored stick-figures (a winding serpent; the pump's arc).

**Tests updated (hardcoded coverage lists / pins)**
- `tests/themes.test.ts` — `ARCHETYPES` list + constellation count 37→39, arc split [13,13,11]→[14,13,12].
- `tests/worlds.test.ts` — `NEW` + `NEW_BIOMES`.
- `tests/constellations.test.ts` — figure count 37→39.
- `tests/round.test.ts` — seed-1234 pin re-pinned (adding biome rows shifts the default `pickBiome`
  weighted selection; the new outcome is a sane par-3 birdie). A benign content-reflow re-pin, like
  the previous world additions — every seeded *harness* (death-spiral, fairness, auto≡interactive)
  stayed green, so no invariant moved.

## No test-hub change
No new `window._gs*` flag or `?param` was added (biomes/themes are content-as-data, absorbed
automatically), so the auto-discovering hub-sync guard needs nothing.

## Known minor / follow-ups
- The mire's **penalty water renders blue** (the global `WATER` palette), which slightly undercuts
  the "acid" read against the olive bog. The bubbling ground pools in `archetypeDecor` are green; a
  per-biome water tint would strengthen it but touches the hot shared water/merge path — deferred as
  not worth the risk (the world already reads unmistakably distinct).
- Remaining GS-more-worlds: **neon/cyber grid** and **lightning-storm** (the latter overlaps Tempest
  — give it a distinct physical niche or drop it).
