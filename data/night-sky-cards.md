# Night-sky cards — reference catalogue

A self-contained, project-agnostic list of the night-sky objects and events behind the “night mode” cards: 
constellations, deep-sky objects, planets and dated/recurring events, with positions (equatorial **J2000**, degrees), 
dates and curation metadata. The machine-readable version is **`night-sky-cards.json`** alongside this file.

- **Coordinates:** `raDeg` = right ascension (0–360°), `decDeg` = declination (−90..+90°), J2000. Convert to alt/az for an observer/time at import.
- **`minAltitudeDeg`:** how high the object must be before it counts as “up”.
- **`rarity`:** optional curation grade (`common` → `rare` → `epic` → `legendary`). Ignore if you have no such concept.
- **`lines`** (constellations): stick-figure links as index pairs into that figure’s `stars`.
- **Dates:** absolute = `[year, month, day]`; annual = `{month, day}`.

## Contents

- **constellations**: 28
- **brightStars**: 74
- **deepSky**: 17
- **galaxyFeatures**: 2
- **planets**: 5
- **meteorShowers**: 9
- **comets**: 1
- **oneOffEvents**: 5
- **seasonMarkers**: 4
- **recurringEvents**: 11

## Constellations

| Constellation | Abbr | Rarity | Min alt° | Anchor (brightest) star | Best seen |
| --- | --- | --- | --- | --- | --- |
| Crux | Cru | common | 6 | Acrux | Circumpolar from southern latitudes — up every clear night, riding highest on autumn–winter evenings (Apr–Jul). |
| Centaurus | Cen | common | 6 | Rigil Kent | Circumpolar from southern latitudes, highest on autumn–winter evenings. |
| Orion | Ori | common | 5 | Rigel | Summer evenings from southern latitudes (Dec–Mar), high in the north. |
| Canis Major | CMa | common | 5 | Sirius | Summer from southern latitudes (Dec–Mar), passing high overhead. |
| Scorpius | Sco | common | 6 | Antares | Winter (Jun–Aug) from southern latitudes — passes almost overhead, the finest view on Earth. |
| Sagittarius | Sgr | common | 6 | Kaus Australis | Winter (Jun–Aug) from southern latitudes, high in the sky. |
| Leo | Leo | common | 6 | Regulus | Autumn to early-winter evenings from southern latitudes (Mar–Jun), seen to the north. |
| Taurus | Tau | common | 5 | Aldebaran | Summer evenings from southern latitudes (Dec–Feb), to the north. |
| Gemini | Gem | common | 5 | Pollux | Summer evenings from southern latitudes (Jan–Mar), to the north. |
| Carina | Car | common | 6 | Canopus | Circumpolar from southern latitudes; highest on summer–autumn evenings. |
| Triangulum Australe | TrA | rare | 6 | Atria | Circumpolar from southern latitudes; rides high on winter evenings. |
| Grus | Gru | rare | 6 | Alnair | Spring evenings from southern latitudes (Sep–Nov), to the south. |
| Vela | Vel | common | 6 | Regor | Circumpolar-ish from southern latitudes; highest on summer–autumn evenings, high in the south. |
| Corvus | Crv | rare | 8 | Gienah Crv | Autumn–early winter evenings from southern latitudes (Apr–Jun), to the north. |
| Cygnus | Cyg | rare | 8 | Deneb | Winter evenings from southern latitudes (Jun–Aug), low across the northern horizon. |
| Lyra | Lyr | rare | 8 | Vega | Winter evenings from southern latitudes (Jun–Aug), low in the north. |
| Aquila | Aql | rare | 7 | Altair | Winter evenings from southern latitudes (Jun–Aug), low to mid in the north. |
| Virgo | Vir | rare | 7 | Spica | Autumn–winter evenings from southern latitudes (Apr–Jul), to the north. |
| Musca | Mus | rare | 6 | Alpha Mus | Circumpolar from southern latitudes — up every clear night, highest on autumn–winter evenings. |
| Lupus | Lup | rare | 6 | Alpha Lup | Winter evenings from southern latitudes (Jun–Aug), high in the south. |
| Ara | Ara | rare | 6 | Beta Ara | Winter evenings from southern latitudes (Jun–Aug), riding high in the south. |
| Tucana | Tuc | rare | 6 | Alpha Tuc | Circumpolar from southern latitudes; highest on spring evenings. |
| Phoenix | Phe | rare | 6 | Ankaa | Spring–summer evenings from southern latitudes (Oct–Dec), to the south. |
| Puppis | Pup | common | 6 | Naos | Summer–autumn evenings from southern latitudes (Jan–Apr), high overhead. |
| Columba | Col | rare | 7 | Phact | Summer evenings from southern latitudes (Dec–Mar), passing high overhead. |
| Pegasus | Peg | common | 7 | Alpheratz | Spring evenings from southern latitudes (Sep–Nov), low to mid in the north. |
| Canis Minor | CMi | common | 7 | Procyon | Summer evenings from southern latitudes (Jan–Mar), to the north. |
| Capricornus | Cap | rare | 6 | Deneb Algedi | Winter–spring evenings from southern latitudes (Aug–Oct), to the north. |

Each constellation in the JSON also carries its full star list (`name, raDeg, decDeg, mag`), the stick-figure `lines`, and lore (`meaning, culture, howToFind, bestSeen, brightestStar, funFact`). Star counts:

- **Crux** — 5 stars, 2 figure lines.
- **Centaurus** — 15 stars, 17 figure lines.
- **Orion** — 9 stars, 10 figure lines.
- **Canis Major** — 6 stars, 6 figure lines.
- **Scorpius** — 14 stars, 13 figure lines.
- **Sagittarius** — 17 stars, 18 figure lines.
- **Leo** — 9 stars, 10 figure lines.
- **Taurus** — 7 stars, 5 figure lines.
- **Gemini** — 10 stars, 10 figure lines.
- **Carina** — 7 stars, 7 figure lines.
- **Triangulum Australe** — 3 stars, 3 figure lines.
- **Grus** — 5 stars, 4 figure lines.
- **Vela** — 5 stars, 5 figure lines.
- **Corvus** — 4 stars, 4 figure lines.
- **Cygnus** — 5 stars, 4 figure lines.
- **Lyra** — 5 stars, 5 figure lines.
- **Aquila** — 7 stars, 6 figure lines.
- **Virgo** — 9 stars, 8 figure lines.
- **Musca** — 6 stars, 6 figure lines.
- **Lupus** — 7 stars, 7 figure lines.
- **Ara** — 7 stars, 6 figure lines.
- **Tucana** — 5 stars, 5 figure lines.
- **Phoenix** — 6 stars, 5 figure lines.
- **Puppis** — 7 stars, 7 figure lines.
- **Columba** — 6 stars, 5 figure lines.
- **Pegasus** — 8 stars, 8 figure lines.
- **Canis Minor** — 2 stars, 1 figure lines.
- **Capricornus** — 8 stars, 8 figure lines.

## Deep-sky objects

| Object | Type | RA° | Dec° | Min alt° | Optics | Rarity |
| --- | --- | --- | --- | --- | --- | --- |
| Eta Carinae Nebula | Nebula | 161.265 | -59.866 | 10 | naked eye | epic |
| Omega Centauri | Globular cluster | 201.697 | -47.479 | 10 | naked eye | epic |
| Jewel Box Cluster | Open cluster | 193.417 | -60.367 | 10 | binoculars | rare |
| 47 Tucanae | Globular cluster | 6.024 | -72.081 | 8 | naked eye | rare |
| Tarantula Nebula | Nebula | 84.679 | -69.1 | 8 | binoculars | epic |
| Orion Nebula | Nebula | 83.822 | -5.391 | 8 | naked eye | epic |
| The Pleiades | Open cluster | 56.871 | 24.105 | 6 | naked eye | rare |
| The Coalsack | Dark nebula | 190.5 | -63 | 8 | naked eye | rare |
| Centaurus A | Galaxy | 201.365 | -43.019 | 10 | binoculars | epic |
| Lagoon Nebula | Nebula | 270.924 | -24.386 | 8 | binoculars | rare |
| Sculptor Galaxy | Galaxy | 11.888 | -25.288 | 10 | binoculars | epic |
| Southern Pinwheel | Galaxy | 204.254 | -29.866 | 10 | binoculars | epic |
| Ptolemy Cluster | Open cluster | 268.45 | -34.79 | 8 | naked eye | rare |
| Southern Pleiades | Open cluster | 160.6 | -64.4 | 8 | naked eye | rare |
| Wishing Well Cluster | Open cluster | 166.4 | -58.75 | 8 | naked eye | rare |
| Helix Nebula | Nebula | 337.41 | -20.84 | 10 | binoculars | epic |
| Sombrero Galaxy | Galaxy | 189.998 | -11.623 | 10 | binoculars | epic |

## Naked-eye galaxy features

- **Milky Way core** (rare) — RA 266.42°, Dec -29.01° — Galactic centre (in Sagittarius). The bright centre of our galaxy. Winter (Jun–Aug) is prime season from the southern hemisphere.
- **Magellanic Clouds** (rare) — LMC (RA 80.89°, Dec -69.76°); SMC (RA 13.16°, Dec -72.8°). Two naked-eye companion dwarf galaxies circling the south celestial pole; they look like detached wisps of Milky Way. Southern-hemisphere only.

## Planets

| Planet | Rarity | Note |
| --- | --- | --- |
| Mercury | rare | Low in twilight — hardest naked-eye planet |
| Venus | common | Brightest planet — unmistakable |
| Mars | rare | Distinctly orange-red to the eye |
| Jupiter | common | Second-brightest planet; moons visible in binoculars |
| Saturn | rare | Steady pale-gold point; rings need a small telescope |

_Positions are computed from orbital elements per observer/time, so no fixed coordinates are listed. The Moon is handled as a recurring event (below)._

## Events — meteor showers

| Shower | Peak | Active window | ZHR | Radiant RA° | Radiant Dec° | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Quadrantids | 4 Jan | 28 Dec – 12 Jan | 110 | 230 | 49 | Radiant too far north — poor from southern latitudes |
| Lyrids | 22 Apr | 14 Apr – 30 Apr | 18 | 271 | 34 | Low northern radiant — modest from southern latitudes, pre-dawn |
| η Aquariids | 6 May | 19 Apr – 28 May | 50 | 338 | -1 | One of the best southern showers — pre-dawn east |
| δ Aquariids | 30 Jul | 12 Jul – 23 Aug | 25 | 340 | -16 | Good from the south — best after midnight |
| α Capricornids | 31 Jul | 3 Jul – 15 Aug | 5 | 307 | -10 | Few but famously bright slow fireballs |
| Perseids | 13 Aug | 17 Jul – 24 Aug | 100 | 48 | 58 | Radiant barely rises from southern latitudes — largely a northern show |
| Orionids | 21 Oct | 2 Oct – 7 Nov | 20 | 95 | 16 | Halley’s comet debris — pre-dawn, decent from southern latitudes |
| Leonids | 17 Nov | 6 Nov – 30 Nov | 15 | 152 | 22 | Pre-dawn northeast |
| Geminids | 14 Dec | 4 Dec – 17 Dec | 150 | 112 | 32 | Best shower of the year, strong even from southern latitudes |

## Events — comet apparitions (dated)

| Comet | Trackable | Peak | Fades by | Peak mag | Optics |
| --- | --- | --- | --- | --- | --- |
| Comet 10P/Tempel 2 | 1 Jul 2026 | 3 Aug 2026 | 20 Sep 2026 | 8 | binoculars |

## Events — one-off dated events

| Event | Date | Rarity |
| --- | --- | --- |
| Penumbral Lunar Eclipse | 20 Feb 2027 | rare |
| Penumbral Lunar Eclipse | 17 Aug 2027 | rare |
| Partial Lunar Eclipse | 6 Jul 2028 | epic |
| Total Solar Eclipse | 22 Jul 2028 | legendary |
| Asteroid Apophis Flyby | 13 Apr 2029 | legendary |

Full descriptions and viewing notes are in the JSON `events.oneOffEvents[].details`.

## Events — solstices & equinoxes

| Marker | Date | Stargazer note |
| --- | --- | --- |
| March Equinox | 20 Mar | Nights begin to lengthen again — the slow return of darker, longer skies for stargazing. |
| June Solstice | 21 Jun | The longest nights of the year, with the galactic core riding high — peak deep-sky viewing from Australia. |
| September Equinox | 22 Sep | A balanced 12-hour night; good aurora season as geomagnetic activity tends to pick up around the equinoxes. |
| December Solstice | 21 Dec | Short nights, but Orion, the Pleiades and brilliant summer stars dominate the evening sky. |

## Events — recurring / live (computed)

These have no fixed coordinates or dates — they are produced when a runtime condition (live data or an ephemeris computation) is met.

| Event | Rarity | Trigger |
| --- | --- | --- |
| Aurora Australis | legendary | Live geomagnetic activity (NOAA Kp index). |
| Solar Flare | epic | Live GOES X-ray flux (M-class and above). |
| Space Station (ISS) pass | epic | Live orbital position above the observer’s horizon, while sunlit. |
| Full Moon | common | Computed next full-moon date (within ~2 weeks). |
| New Moon | rare | Computed next new-moon date (within ~2 weeks). |
| Supermoon | epic | Computed: a full moon near perigee (distance ≤ ~361,500 km). |
| Planetary Conjunction | epic | Computed: two planets within a few degrees in the sky (upcoming). |
| The Moon | common | Always present; phase + position computed at runtime. |
| Mars at Opposition | legendary | Computed: Earth between the Sun and Mars (±~3-week window). |
| Jupiter at Opposition | epic | Computed: Earth between the Sun and Jupiter (±~3-week window). |
| Saturn at Opposition | epic | Computed: Earth between the Sun and Saturn (±~3-week window). |

---

_Generated from a single source list. Regenerate with the companion extractor if the source changes. Southern-hemisphere wording is intentional; the coordinates are universal._
