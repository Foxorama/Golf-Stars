# Archived engineering log — render

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

## Render layer (locked in GS-3)
- **One pure projector** (`render/project.ts`) does the course-space→screen mapping (tee→green
  up, fit-to-view). BOTH renderers use it so they agree pixel-for-pixel — never reimplement the
  transform. `render/palette.ts` is the shared surface/biome colour table (render-only; the sim
  never sees colour).
- **SVG = the static map** (`holeView.ts`, pure string builder, testable). **Canvas2D = the
  animated play view** (`playView.ts`), driven off the `ShotLog[]` the round sim already emits —
  arc/shadow/trail/impact/screen-shake. Keep the pure flight math in `trajectory.ts` (tested) and
  the imperative drawing thin.
- **The static WORLD is one shared, cell-shaded scene builder (`render/style.ts`, GS graphic-upscale).**
  Both renderers used to duplicate a flat draw path (every surface a single solid polygon on a flat
  rough slab — the "landing strip" look). Now `buildScene(hole, proj, {width,height,biome,art})` is the
  SINGLE source of truth: it projects the hole into a flat list of screen-space `Prim`s (poly/circle/
  line/clip) and the two thin interpreters — `scenePrimsToSvg` (pure string) and `drawScenePrims(ctx)`
  (canvas) — draw them, so the map and the play view agree. The manga/comic language: flat tone BANDS +
  a bold ink outline per surface (`SHADES` ramps in `palette.ts`, `base` = the original `FILL` value so
  the SVG still carries `#3f8c3f`/`#5fd45a` and the render tests stay green); mowing **stripes** (clipped
  horizontal bands — perpendicular-to-play after the projector rotates tee→green up) on fairway/green.
  Fairway-stripe tones are SOFTENED toward the base (`mowTones`, GS-cetus-5) — the full light/dark shades
  read as a harsh striped snake on a thin wiggly corridor; `MOW_BLEND` keeps the value-crushed indigo
  worlds (void/cetus) a touch stronger so their mow doesn't vanish. GS-mow-blend went further on both
  counts: every band boundary in the four stripe builders (`stripesAt`/`stripesAtV`/`slantStripes`/
  `checkerStripes`) is FEATHERED — a short 2-step ramp of 35%/65% intermediate tones (single 50% mid
  strip along the checker's grid lines) laid over the hard edge, width `FEATHER_FRAC` of the band; and
  the DARK tone is muted asymmetrically (`mowTones` eases `lo` a further ×0.72 toward the base, ×0.85
  on void/cetus) because the eye reads the dark cut as a shadow line — it was the austere half. The
  green's stripes, which had kept FULL light/dark contrast, now blend toward its base too (0.7 light /
  0.5 dark — a touch stronger than the fairway since the green is the small showpiece surface). All
  pure geometry, zero rng — band grids, phases and counts are untouched, so continuity across
  apron/segments and the byte-stable SVG both hold.
  Side-on plateau extrusion is `platformCliffs` (renamed from `cetusCliffs`, GS-cetus-5) taking a
  `CliffLook` palette: cetus = blue CLIFFTOP into the star-ocean, void = violet ASTEROID underside for
  its lost island-hop pads (gated to the armed hole so a calm void rectangle isn't given an odd
  underside). Both keep the returned `faces` for the cetus waterfall. CALM cetus/void stops (whole
  play-bounds is playable rough, can't be islands) instead get `raisedShelf` (GS-cetus-6): an outset
  rock PEDESTAL shifted down under the fairway/green fill + cast shadow + lit rim, so the corridor
  reads as a two-tier raised mesa. The pedestal rings the surface (visible on the near-vertical edges
  — the key at follow-cam zoom, where a pure downward drop is invisible). Render-only, no rng.
  a darker **collar** ring + lit dome on greens; lip-shadow + depression + rake lines on bunkers; concentric
  **depth banding** + shoreline + glints on water; 3-tone **cell-shaded tree canopies** (core/body/lit cap +
  cast shadow + per-tree colour/size variance); a **textured rough** (soft tone undulation + grass tufts);
  and seeded "fun/alive" accents — biome-flavoured **wildflowers**, sparkle **motes**, the odd **bird**
  (`ACCENTS` table). CRITICAL invariants: (1) all randomness is a mulberry32 seeded from `hashHole()` —
  NEVER `Math.random` — so the SVG is byte-stable (determinism test) and reads the same across reloads;
  (2) `buildScene` is node-pure — the `window._gsArt` escape-hatch is read through `artFeel()` which guards
  `typeof window`, so `renderHoleSVG` stays callable in vitest; (3) accents/tufts are placed in COURSE space
  then projected + culled to the view, so they pan/zoom correctly with the follow-cam (the canvas caches the
  scene by projector identity — whole-hole fit builds once, follow-cam rebuilds per frame). Tee + flagstick
  + OB stakes + centreline moved INTO the builder too (de-duped); the interactive overlays (spray cone, live
  ball, shot lines, HUD, animation) stay per-renderer. Canvas feel is eyes-on, but the SVG path is verified
  by rasterising a biome×seed gallery — re-shoot one after any `style.ts` change.
- **Surfaces BLEND into a cohesive environment, they aren't stickers on a slab (GS-blend, `style.ts`).**
  The complaint: tees/greens/fairways "just on/next to each other", and rivers that don't read as rivers
  with lakes that don't blend into them. Four coupled fixes, all pure render, all off the art `rng`/`crng`
  (no sim touch, byte-stable): (1) **`offsetPoly(poly, d)`** — a true uniform polygon inset (`d>0`)/outset
  (`d<0`) by mitring each vertex along its edge-normal bisector. Unlike the old `scalePoly`-toward-centroid
  (which crushes a long thin band into a centred sliver) it HUGS the shape, so a river band gets
  channel-following depth rings and a fringe is even-width on a kidney green or long fairway. (2) **First-cut
  fringes** — fairway/green/tee are drawn nested in a soft outset ring blended halfway toward this world's
  rough (`mixHex(base, rough.base, ~0.5)`), and the turf ink edges are softened to translucent (`hexAlpha`)
  mowing lines, so the cut grass EASES into the land instead of a hard cut-out outline. (3) **Grouped liquid
  FAMILIES** — `styleLiquidFamily(polys, palette, rng)` draws ALL the water (water/frozenpond/creek), then
  ALL the lava (lava/lavariver), in shared layered passes: every shore/crust UNDER every body, then bodies
  (overlaps MERGE into one surface — no seam), then `offsetPoly` depth rings + detail. An elongated body
  (long chord ≫ ⟂ width via `longAxis`/`extentAlong`) gets lengthwise FLOW streaks so a river reads as
  flowing current/molten lava; a roundish lake keeps glints. NO per-body ink outline (it would redraw a
  seam through an overlap) — the shore IS the edge. This is what makes a lake and a crossing river of the
  same liquid read as ONE connected body (the "lake and river don't blend" fix). (4) **The landmass is a
  ROUNDED, gently-irregular island hull** (`roundedHull`, off its own `hrng`), not a hard rectangle frame,
  so a stop reads as ground floating in space. CRITICAL invariants kept: `#3f8c3f`/`#5fd45a` turf bases
  still emitted (the holeView fill test), the constellation prim-COUNT invariants (the blend prims are
  theme-independent), and determinism (all extra randomness is the existing art streams). The grouped-pass
  reorder shifts the art `rng` stream slightly → mote/bird/flow positions move (visual only, deterministic).
  `tests/render-blend.test.ts` guards `offsetPoly` (shrink/grow + river-hugging) and that a lava river /
  water creek render through the family drawer. Re-shoot the gallery (`node scripts/gallery.mjs`) after any
  `style.ts` change.
- **SAND is also a grouped family + hazard draw order + archetype scatter recolour (GS-blend-2, `style.ts`).**
  Four cohesion fixes: (1) `styleSandFamily(polys, art, scale)` draws ALL sand (bunker/waste/craters) the
  same GROUPED way as the liquids — shadows under every body, then bodies (overlaps merge), then per-body
  rake, NO per-body ink — so overlapping bunkers read as one excavated body instead of seamed stickers.
  (2) The hazard pass order is layered: SAND first, then exotic scatter, then the penalty LIQUIDS ON TOP
  (so a river through a sandy waste band shows as WATER, not buried under sand), then trees last. (3)
  `scatterLook(kind, arch)` recolours faceted crystal/ice per archetype — on INFERNO it's molten obsidian,
  not a cyan ice patch (the "ice on lava zones" bug; `styleScatter` now takes `arch`, threaded at both the
  feature + hazard call sites). (4) Static `windStreaks` are denser/brighter so the weather READS on the
  decision map BEFORE the shot (it used to be so faint pre-shot that wind only seemed to appear in the
  animated flight). CRITICAL: sand/scatter consume NO rng and wind is the last `crng` consumer, so the
  main terrain rng stream + the liquid/tree draws are byte-for-byte unchanged (determinism + the full
  suite hold). Re-shoot the gallery after touching it.
- **Per-ZONE turf palettes + signature visuals (GS-19, `palette.ts`/`style.ts`).** The old per-theme
  look only HUE-ROTATED the green turf — barely readable ("green fairways in no way match the themes").
  Now each of the 5 archetypes has an EXPLICIT designed turf palette (`ARCHETYPE_TURF`): desert firm
  tan, frost frosted teal/mint, inferno scorched ash-olive, void cosmic indigo, **verdant = the
  original `SHADES` values byte-for-byte** (so a themeless / verdant render is unchanged and the
  render tests still see `#3f8c3f`/`#5fd45a`). `buildScene` resolves the archetype from the theme id
  (else the biome id, via `archetypeFor`) and rarity-deepens it (`worldLook`); the stylers now take a
  resolved `Shade` instead of computing from a hue tint. Signature surfaces: lava (the `LAVA_LIQ` palette
  fed to the GS-blend `styleLiquidFamily` — charred crust shore → glowing body → hot core + flow streaks,
  the SAME drawer as water so flanking lakes AND crossing rivers read as one connected magma) and
  the void's luminous **island glow** under the fairway/green so the platforms read as land in the
  abyss (the off-fairway IS the void). The dark per-biome rough (`roughBaseFor`) + starfield accents
  carry the "space" read. Re-shoot the biome×seed gallery (`node scripts/gallery.mjs`) after any
  palette/`style.ts` change.
- **Every course FLOATS as a landmass in a per-world deep-space sky (GS-stellar — "golf amongst the
  stars", `palette.ts`/`style.ts`).** The old look filled the whole viewport with the rough slab, so a
  stop read as a recoloured golf hole on a coloured rectangle — "samey, just a different palette". Now
  `buildScene` paints, in order: (1) an opaque world-tinted **deep-space base** + soft nebula smears
  (`ARCHETYPE_SPACE`/`spaceLookFor` — verdant blue-night, desert rust dusk, frost teal void, inferno
  ember-black, void violet abyss). CRITICAL (GS-glow-prim): the nebulae are a SOFT radial **`glow`
  Prim** (a new prim type — radial gradient `col`→transparent, drawn in BOTH `scenePrimsToSvg` via
  `<radialGradient>` and `drawScenePrims` via `createRadialGradient`), NOT flat-fill `circle`s. Flat
  discs rendered with HARD circular edges that read as a "weird static blob" floating over the hole
  (and changed size/position between the portrait decision map and the fullscreen play view → "it
  disappears on ball flight"); the glow is a luminous wash, matching the intro's screen-blended sky.
  The bright-star halos use `glow` too. (Count went 2→3 nebulae — theme-independent + off `crng`, so
  the constellation prim-count invariants `deepSky==plain`/`constellation>plain` still hold.) (2) a
  **starfield** (90·`accents` screen-space stars w/ haloed twinkles) + the existing far planet/comet,
  ALL off the independent `crng` stream (the far planet is kept SMALL, HIGH in the sky band, and
  TRANSLUCENT — `hexAlpha(pcol, 0.62)`, `r 6–13`, `y 3.5–13.5%` — so it reads as a DISTANT body, not a
  bright disc parked over the green; a low/large/opaque one looked like a "weirdly placed graphic"
  floating on the course during the screen-space follow-cam flight; same `crng` draw count, so
  determinism + the constellation prim-count invariants are untouched); (3) the **landmass**
  ⚠️ *items (3)/(4) SUPERSEDED by GS-rough-frame (2026-07-01 entry, end of file): the land now fills
  the OB box as proper rough and the star-salt is gone —*
  = a TIGHT hull around the hole geometry (the feature/hazard bbox `cb` + a small `landMargin`, NOT the
  full OB box) filled with `landFillFor` and ringed by an atmospheric **edge glow** (`SpaceLook.edge`,
  the void's island treatment generalised to all five worlds), so beyond the shoreline you see SPACE,
  not green; (4) the rough tone/tufts/flowers + a ground-star salt, **clipped to the island**. CRITICAL
  (the "too much in-bounds rough" fix): the drawn land is DECOUPLED from the OB **play-bounds box** —
  the OB box stays a deliberately GENEROUS fairness boundary (`clamp(span*0.25,40,90)`) that filling
  with rough sprawled turf to the screen edges so the zoomed play view was wall-to-wall green; the
  tighter hull lets the starfield read DURING play while the real OB box remains the (invisible) trigger
  and its stakes float out in the void (purely visual — OB/fairness untouched). And `landFillFor` blends
  the rough base 0.62 toward the space base (`LAND_SPACE_BLEND`), so the in-bounds ground is a dark,
  star-salted NIGHTSCAPE (golf amongst the stars) and the bright mown fairway/green pop against it — NOT
  a bright slab. On the whole-hole map the course floats among its stars; in the zoomed follow-cam you're
  on the dark starry ground under the same sky.
  CRITICAL determinism: the main `rng` is still consumed in the SAME order (patches→tufts→flowers) BEFORE
  the terrain/tree/water/lava draws that read off it, so their look is byte-for-byte unchanged — only the
  PAINT position moved (into the island clip); all NEW celestial scatter uses `crng`. The render tests
  hold: the background additions are theme-independent + archetype-equal, so the constellation test's
  `deepSky == plain` / `constellation > plain` count invariants and the `#3f8c3f`/`#5fd45a` turf checks
  are untouched. The stop's **constellation** (`constellationBackdrop`) was promoted from a faint corner
  motif to a large overhead **sky** drawn ON TOP of the terrain (so it's the stop's identity in BOTH the
  map and play), with the brightest star as a glowing **anchor** (Antares, Rigel…); still gated by
  `themeId` + a real figure, no rng, so a deep-sky/themeless render stays byte-identical. The play view's
  space FX (now the shared `render/weather.ts` twinkling stars + sweeping shooting star) carry the intro's
  starfield into live play — all on the existing `_gsFeel.spaceFX` knob, no new `_gs*` flag. NB: the
  aiming overlays (spray cone, flight lines, live ball) draw AFTER `buildScene`, so the busy sky never
  occludes the shot UI. Re-shoot the gallery after touching any of this.
- **Per-world IDENTITY pass (GS-biome-feel, `style.ts`/`palette.ts`/`weather.ts`/`playView.ts`).** The
  complaint: "all the biomes are just reskinned variants" — the physics table already differentiated
  worlds (void 1.4× gravity, tempest gales, lost-rough abysses) but almost none of it READ, because the
  presentation was shared: every world drew the identical green parkland canopy (the spore jungle's
  "luminous mushroom stands" were literally oak trees), OB was the same white/red golf stake on every
  world including the void, the animated wind tint only covered the original 5 archetypes (the 5
  GS-worlds silently fell back to verdant's pollen green), landings looked identical whether the ball
  found lava, water or the abyss, and the rough accents were the same wildflower dots recoloured. Five
  coupled fixes, ALL render/feel-side (zero sim/rng-stream touch — determinism contract #1 holds
  trivially): (1) **`styleFlora`** — the tree hazard dispatches per archetype to a distinct silhouette
  (fungal glowing mushrooms, frost snow-dusted conifers, inferno charred ember snags, desert saguaros,
  crystal prismatic shard spires, tempest wind-bent scrub, ocean palms, cetus bio-speckled sea-stacks;
  verdant keeps the classic canopy BYTE-IDENTICAL). CRITICAL rng rule: every variant consumes EXACTLY
  the two draws the old `styleTree` did (size + tint); all further variation is `posHash` of the
  projected position — so the main art stream is byte-for-byte unchanged on every world. (2)
  **`archetypeDecor`** — the Cetus whale/river treatment generalised: a bespoke signature decor pass per
  world on its OWN dedicated stream (`hashHole ^ 0xb10a3e`), gated per archetype — void asteroid islets
  (whale-style course-space rejection placement) + a black-hole eye, inferno glowing ground fissures,
  fungal spore-mist + toadstool clusters, crystal shard clusters + prismatic ground glints, frost snow
  drifts + ice-sheen cracks, desert dune ripples + bleached rocks, tempest cloud-shadow bands + a storm
  eye with a static fork, ocean surf foam-lines + lagoon cays with a lone palm. Drawn under the terrain
  pass so the mown turf paints over it; clipped decor gathers into ONE island clip (never nest clips —
  the SVG serializer bug). (3) **`OB_LOOK`** (palette) — per-world boundary markers; the two lost-rough
  worlds (void/cetus) trade the ground post for a FLOATING warp beacon (glow + lit diamond, position-hash
  bobbed) since there's no ground out there to plant a stake in. The OB *rule* is untouched. (4)
  **`scatterLook`** grew per-world crystal identities: void violet lit-from-within, cetus coral-pink
  bioluminescent reef, prism-reach pink/green refractions — plus an under-glow prim when a look sets
  `glow`. (5) **weather.ts** — `WIND_RGBA` covers all 10 archetypes, and a new always-on `AMBIENT` table
  drives a per-world air layer on the same `spaceFX` gate as the stars: rising embers, falling snow,
  drifting glow-spores, verdant fireflies, prismatic twinkle-glints, slow void stardust, sea-spray
  flecks, rising cetus plankton motes, desert dust — and tempest gets a distant seeded lightning flicker.
  (6) **playView.ts `spawnLandFX`** — per-surface touchdown feedback keyed off the lie/penalty the sim
  already resolved (index-based deterministic particles, like `spawnSparks`): water/creek/frozenpond
  splash, lava burst + shake, a violet ring-IMPLOSION as the void swallows the ball, star-ocean splash,
  ravine rockfall dust, sand puff, icy skitter, crystal chime-glints, canopy leaf-rattle. Guards:
  `tests/biome-identity.test.ts` (per-world flora/decor/OB gating + all-10 coverage of the weather/OB
  tables + byte-stability); the existing turf-base, constellation prim-count and cetus gating tests all
  hold (additions are theme-independent + archetype-gated). Re-shot the gallery.
- **Zone splash card + procedural hero art (GS-19, `render/zoneHero.ts` + `app.ts`).** The zone
  identity now lives ONCE per stop, on the **starting zone screen** (the `intro` screen,
  `zoneIdentityHTML`) — NOT repeated per hole (the per-hole briefing splash was retired; see
  *Play-loop UX*). It leads with a thematic **hero scene** — a self-contained, deterministic SVG
  illustration per archetype (`zoneHeroSVG`: a garden dawn, a Mars dust horizon, a glacier aurora, a
  volcanic lava-flow world, the void's island past a black hole) — NO downloaded asset to 404 (the
  house rule, same as the intro). Below it: the zone NAME + signature + theme, a **difficulty** pip
  rating, the real-space INSPIRATION, a brief, and two columns of HAZARDS / BENEFITS — all pure DATA
  from `src/sim/course/zones.ts` (`ZONES`, archetype-keyed prose/profile; the physics stay in
  `biomes.ts`). The LIVE per-hole facts (wind/conditions, including an armed void lost-rough warning)
  moved onto the play screen's top stat bar. The hero SVG is `width:100%` responsive so it fills the panel.
- **Feel tunables read from `window._gsFeel`** (the escape-hatch rule) so loft/shake/trail/timing
  A/B live without touching the sim. Canvas feel can't be unit-tested — say "needs eyes-on play".
- **On-screen WIND + denser woods (GS-wind, `style.ts`/`playView.ts`/`generate.ts`).** The wind you
  read off the shot bearing is now VISIBLE: streaks blow across the hole in the wind's screen direction
  (`windScreenDir` projects `Wind.dir` through the tee→green-up projector so it reads true), themed per
  world (`WIND_COL`: inferno solar wind/embers, frost driven snow, desert dust, verdant pollen, void
  cosmic dust), with count + length scaling by `Wind.spd`. TWO layers, both off seeded streams so they
  never perturb determinism: a STATIC pass in the shared `buildScene` (`windStreaks`, off `crng`, so the
  SVG map + gallery read the weather and the constellation count invariants still hold — streaks are
  theme-independent + archetype-equal) and an ANIMATED toroidal drift (now in `render/weather.ts`'s
  `drawWind`, on the existing `_gsFeel.wind` knob — no new `_gs*` flag, so the test-hub guard needs none).
  Treelines are also DENSER and deeper (the `treeCount` multiplier + lateral spread bumped) so the rough
  reads as real forest, not a thin line — still non-penalty, still OUTSIDE the corridor (the death-spiral
  bars held). Animated wind is canvas feel → verified eyes-on; the static streaks are gallery-checked.
  - **Wind reads as FLOWING comet-streaks, not rain scratches (GS-wind-2).** The old streaks were short,
    uniform, scratchy dashes (read as "rain on the glass" — the user's "really weird static affect").
    Both layers were redrawn so the wind DIRECTION + STRENGTH are unmistakable at a glance (the design
    goal: don't make the player squint at the tiny "14 mph crosswind" card chip): the ANIMATED `drawWind`
    is `lighter`-blended tapered streaks — a bright glowing HEAD leading into the wind direction + a
    gradient TAIL trailing upwind, with a gentle cross-stream flutter — where count, length, glow AND
    drift SPEED all scale with `windSpd` (a strong wind is a faster, busier, brighter stream you can see
    push the shot); the STATIC `windStreaks` are now sparse two-segment comets (faint long tail + brighter
    short head) so the leading edge reads even on the still SVG map. The ambient starfield was also
    lush'd to match the intro (area-scaled count, hero stars blooming through a cached glow sprite — the
    intro's `shadowBlur`-avoidance perf trick). Still off the seeded streams (determinism untouched).
- **Weather / atmosphere layer is a SHARED, animated, SCREEN-SPACE module (`render/weather.ts`,
  GS-journey-fx rework).** The journey route's `CourseEffect` (moonlight / meteor shower / aurora / solar
  storm / debris field / trade camp) used to be drawn TWO ways that diverged and disappointed: flat
  `courseEffectPrims` polys baked into the static SVG scene (a muddy full-frame colour wash + tiny
  course-PROJECTED ground decor — trade tents / debris shards planted near the tee), plus a thin
  `drawCourseFx` overlay in `playView`. Three problems: (1) it "looked trash" — flat washes, scratch-like
  meteors; (2) the course-projected ground decor read as a "static layer that jumps all over the place"
  as the follow-cam panned (it was anchored to a fixed course point near the tee, swinging across/off
  screen); (3) the animation only played while the ball was IN FLIGHT (the decision/aim + putt screens are
  the static SVG map, so lining up a shot was dead). Fix: ONE module — `createWeather({effect, width,
  height, archetype, windSpd, windDir, seed, spaceFX, wind})` returns a `{draw(ctx,now), setWind, resize}`
  handle that paints the whole atmosphere in SCREEN space (the sky + the air): a subtle directional tint
  (never a flat wash), the showpiece (glowing moon with halo+craters / flame-tailed meteor fireballs
  (GS-meteor-look — see rpg-meta-loop.md) / shimmering layered aurora curtains / a pulsing solar flare + edge vignette + crackle / drifting
  lit debris wrecks with blink lights / a horizon trade caravan with dome tents + a swaying lantern string),
  PLUS the always-on space ambience (twinkling stars + a periodic shooting star) and the VISIBLE wind. It
  is consumed by BOTH the `playView` (in flight, replacing the old `drawSpaceFX`/`drawWind`/`drawCourseFx`)
  AND a lightweight transparent overlay canvas `app.ts` mounts over the decision + putt maps
  (`mountWeatherOverlay`, `[data-weather]`, `pointer-events:none` so the pull-to-shot passes through), so
  the world is alive while you AIM and PUTT, not only mid-flight — and both screens use the SAME module +
  the SAME per-hole `weatherSeed(hole)`, so it's a seamless hand-off. Because it's all SCREEN-SPACE it is
  the SKY (correctly viewport-anchored) — the old "ground decor jumps" bug is gone (the trade camp is now a
  screen-fixed horizon caravan, the debris drifts in orbit). The static `courseEffectPrims` + the
  `SceneOpts.effect`/`RenderOptions.effect` fields were REMOVED, so `buildScene` no longer draws weather
  (the overlay / play view own it); determinism is untouched (it consumed `crng` LAST, so terrain is
  byte-for-byte identical — the constellation count invariants + `#3f8c3f`/`#5fd45a` turf checks hold). All
  seeded (mulberry32 off the hole, never `Math.random`); reduced-motion draws a single calm frame (the
  overlay just stops ticking). NO new `_gs*`/URL hook (`_gsFeel.spaceFX`/`.wind` still gate the ambience,
  passed in by the play view; the overlay is plain DOM like the caddy badges + putt meter), so the test-hub
  guard needs nothing. Canvas feel → verified eyes-on (Playwright: all six effects animate + read clean,
  the decision-screen overlay mounts under the HUD with the pull gesture passing through).
  **GS-journey-variety widened the sky set to TEN:** four new showpieces — `eclipse` (indigo pall +
  black sun with wheeling corona streamers and a sliding diamond-ring glint), `ionStorm` (blue-violet
  edge vignette, charged glowing sparks, two families of BRANCHED forked lightning via the shared
  `drawFork`), `nebula` (vast seeded colour fog banks drifting/breathing over the sky half, alphas kept
  low so the course reads), `comet` (blazing head, split ion/dust tails, a sparkle-dust fall) — plus
  upgrades to the weak ones (`spaceJunk` gains one BIG slow foreground derelict with panel seams +
  counter-phase nav lights; `tradeMarket` gains rising warm lantern motes). RULE: every effect's
  scatter is built on its OWN mulberry stream (`o.seed ^ const`), so adding one never re-scatters the
  shared starfield/wind/ambient layout. The sim side (event → effect mapping, the `effectWindMult`
  play hook) lives in `docs/decisions/rpg-meta-loop.md` under GS-journey-variety. Eyes-on all the
  skies at once with `node scripts/weather-preview.mjs` (one canvas per effect over a mock course).
- **The swinging golfer + space ambience (play-view "alive" layer).** Each full shot in `playView`
  now opens with a little loader-style golfer (`drawGolfer` — same stick-figure/cap silhouette as the
  intro crew) who addresses → backswings → strikes during a `swingLeadMs` WINDUP, then holds a fading
  follow-through over the first `followMs` of flight. CRITICAL timing change: the flight clock starts at
  CONTACT (`flightElapsed = now - segStart - lead`), so the existing flight/roll/rest/advance logic is
  unchanged — it just runs `lead` ms later. The figure is authored in a ~72-unit local frame and placed
  so its LOCAL ball (club sole at address) lands on the REAL ball, so club/figure/ball stay in proportion
  at any zoom; its px height is `proj.scale`-nudged but CLAMPED [30,56] so it always reads next to the
  fixed-size ball (r3) + flag (14) markers (literal realism makes a 2-yard golfer microscopic in a
  100-yard view — this is arcade proportion, deliberately). All golfer/space knobs live on the EXISTING
  `_gsFeel` object (`golfer`, `golferPx`, `swingLeadMs`, `followMs`, `spaceFX`) — no NEW `_gs*` flag, so
  the test-hub guard needs no new control. The spacey BACKDROP (distant stars over the rough, a far
  ringed planet, a comet) lives in the shared `buildScene` so BOTH renderers + the SVG gallery get it; it
  draws from a SEPARATE rng stream (`hashHole ^ 0x5747a2`) so existing terrain/tree/mote placement stays
  byte-identical, is gated by the existing `art.accents` density, and is culled OFF the cut grass so the
  play corridor stays clean. `playView` adds a thin animated twinkle/shooting-star overlay (the shared
  `render/weather.ts`) on top for motion only. Canvas feel — verified eyes-on (Playwright frames per swing phase).
- **Focus/zoom + follow-cam (GS-mechanics #7).** The projector has a second fit mode: `focus`
  (centre on a point — the ball) + `viewRadius` (course yards) + `focusBias` (0..1, how far down
  the ball sits) instead of fitting the whole hole. The decision map zooms TIGHT to the contemplated
  shot — `decisionReach = max(30, carryHigh × 0.36)` at `focusBias 0.84` (`DMAP_BIAS`) so the ball
  sits LOW (near the bottom, just above the floating control panel), the shot ahead nearly fills the
  tall portrait view, the corridor fills the width, and the rough/OB legitimately stretch off-screen
  (the "zoom in, let the hole run off the edges" ask). The bias is deliberately deep: at the old 0.72
  the top of a max-distance shot landed ~4% from the top, hidden behind the top info-chip HUD, forcing
  a manual zoom-out on every full swing; 0.84 moves that landing to ~16% from the top (clear of the
  HUD) so the full arc is visible without zooming out. A short approach zooms right in; an unreachable
  green sits off the top. The reach factor + dims +
  bias live in `app.ts` (`DMAP_W/DMAP_H/DMAP_BIAS/decisionReach`) and MUST be kept in sync across
  the three call sites: the decision `renderHoleSVG`, the `wireMapAiming` projector (tap/drag aim
  unprojects against the SAME params or aiming drifts), and the play-view animation mount. The
  animation uses the same focus + an eased follow-cam (rebuilt per frame) so it tracks the ball and
  matches the decision map's zoom (no jump — also closed the decision↔animation projector mismatch).
  - **Putt-watch static frame (GS-putt-watch-lag).** A follow-cam rebuilds the projector every frame,
    which defeats playView's `cachedProj` scene cache (`proj !== cachedProj` is always true against a
    fresh projector object) and so re-runs the whole heavy `buildScene` — flora, rough gradient, green
    contour art — 60×/sec. On a SHOT that's the price of tracking a flying ball, but a PUTTS-ONLY watch
    doesn't need to follow: the putt aim screen already framed the entire ball↔cup span at
    `puttViewRadius` (midpoint-centred, `focusBias 0.5`), so the ball can simply roll across that same
    frame held STILL. The animation mount passes `follow: hadShots` — off for a green putt — plus the
    matching `focus`/`viewRadius`/`focusBias`, so the projector never changes and `buildScene` runs
    ONCE for the whole roll instead of once per frame. This was the putt-watch chug the user reported,
    worst on the frost/ice greens (their sparkle + relief art paint heaviest per frame). Measured 19→1
    `buildScene` calls on a short 2-yd putt via a temporary counter at the `drawStatic` invocation;
    longer putts roll more frames, so the saved rebuilds scale up. A putt roll stays inside the framed
    span (`puttViewRadius` folds in the break bow with margin), so holding still doesn't clip it. `Projector.unproject` is the inverse (screen→course) that
  powers tap/drag aiming. The spray cone is drawn as a true ARC SECTOR (curved near/far edges at
  `carryLow`/`carryHigh`, swept ±`z·angleSd`) with min/max carry labels, matching the angular physics.
- **Map navigation — overview / zoom / pan (GS-mapnav).** The follow-cam frames only the contemplated
  shot, so on a long hole the green sits off-screen and "you have no idea what the full hole looks like".
  Three controls floating ON the map (a `.gs-mapctrl` overlay, top-right — NO scrolling to reach them)
  fix that: a **🗺/🎯 overview toggle** (`mapView 'follow'|'whole'` — `whole` drops `focus` so the
  projector fits the ENTIRE hole, green + OB + all hazards in frame), **＋/− zoom** (`mapZoom`, divides
  `viewRadius`; disabled in `whole`), and a **⌖ recenter** (shown only when moved). PAN: the projector
  `focus` is offset by a course-space `mapPan`, and in `follow` mode a map DRAG pans (drag-the-world-
  under-the-finger via a projector frozen at gesture start). GESTURE DISAMBIGUATION (UPDATED GS-mux —
  supersedes the old "drag pans, tap does nothing" model): the gesture is keyed by POINTER COUNT +
  MOVEMENT, not a mode toggle. ONE finger still (< `TAP_SLOP` 8px) → **TAP-AIM** at that point (the
  discoverable default — tap the green to aim there, sets `selFreeTarget`); ONE finger moved → **PAN**;
  TWO fingers → **PINCH-zoom** (`mapZoom`, alongside the `＋/−` buttons). `wireMapAiming` tracks a
  `Map<pointerId,pos>`; a second finger cancels any pending tap/pan, and the lingering finger after a
  pinch can't register a stray tap. The ✋ button is now the "Aim" segment of the one-row SEGMENTED aim
  control (Attack | Safe | Aim) and seeds the free target at the pin; tapping the map is the primary way
  in. CRITICAL: the decision render AND `wireMapAiming`'s unproject both build the projector from ONE
  shared helper `decisionView(play, spray)`, so tap/drag aiming can't drift from what's drawn (the
  projector-sync gotcha). `mapView/mapZoom/mapPan` are module UI state (like `selClubId`), reset by
  `resetMapView()` on every new shot AND new hole — NOT save/reducer state, NOT a `_gs*` flag (so no
  test-hub sync needed). Single-pointer paths verified eyes-on; pinch needs multi-touch confirmation.
- **The play screen NEVER scrolls (GS-mapnav).** `.gs-shot` is a FIXED-height flex column
  (`height: calc(100dvh − 46px)` + `overflow:hidden`, not the old `min-height`), and `.gs-bigmap` is
  `flex:1 1 0; min-height:0` so the MAP absorbs all the slack — the topbar and the club/aim/Hit
  controls always sit on screen without scrolling down to reach them (the "adjust aim, then scroll to
  hit the ball" complaint). `.gs-bigmap` is `position:relative` to anchor the nav overlay.
- **Spray cone = the shot's ASYMMETRIC `SprayShape`, drawn proportional to chance (GS-dispersion-2,
  `holeView.ts` + `shot.ts`).** The cone is the *landing distribution*: a single `SprayShape`
  (`green` + 4 miss zones — `hookL`/`sliceR` orange, `duckHookL`/`shankR` red) drives BOTH the physics
  sampling and the graphic, so they can't disagree. From the centre out per side: a fixed-width GREEN
  wedge (±`greenZ·σ0`, `σ0` = the base angular spread) then ORANGE then RED bands whose widths are
  `sideK·σ0·(zone probability)` — **drawn size ∝ the chance of landing there**, so a 2% red is ¼ the
  width of an 8% orange (the old bug: red drawn WIDER than orange), a 0% zone vanishes, and a one-sided
  suppression reads as a lop-sided cone. Each band is labelled with its true % (`prob·100`). KEY
  invariant: `green = 1 − Σ(miss zones)`, so cutting a miss zone raises green's % while its wedge keeps
  its width ("great shots land where great shots land") — and the freed % flows to GREEN, never to the
  opposite side (a trade-off mod like `−1% duckHook/+1% shank` is the only way to move mass sideways).
  `sprayBands()`/`sprayAngleRms()` are the shared truth (renderer draws them; `resolveShot` samples
  them — categorical zone pick + within-band position, green centre-peaked/triangular, misses uniform,
  SAME 2-rng-draw budget as the old gaussian angle so auto≡interactive holds). The `window._gsSpray`
  escape hatch is now a `SprayGeom` override (`resolveGeom`); `centralPct` scales the green wedge width
  for live A/B. The play-screen legend (`app.ts`) shows the per-zone % straight off `spray.shape`.
- **The cone's LAYOUT is zoom-aware (GS-spray-zoom, `holeView.ts`).** Every overlay layout decision
  reads the projector's px-per-yard `scale`, so the cone stays readable at ANY zoom / shot length —
  the old fixed layout collided into an overlapping smudge on a chip's tiny cone and on a zoomed-out
  map. Three rules: (1) arc SAMPLING follows the projected arc length (~8px/segment, clamped 6–48)
  instead of a fixed 10, so a zoomed-in cone is a true curve; (2) a zone-% label draws only when its
  band's projected arc width at the label radius fits the text (`textWidthPx` ≈ 0.62em/char) — small
  cones shed labels instead of stacking them; (3) the min/max carry labels MERGE into a single
  `lo–hi y` readout past the far arc when the carry window projects under `CARRY_LABEL_MERGE_PX`
  (20px). The canonical "all five zones labelled" render is the DECISION framing (follow-cam,
  `viewRadius ≈ 0.36·carryHigh`) — the whole-hole overview may legitimately shed the 2% tails
  (`tests/spray-ob.test.ts` asserts both). `sprayPoint()` is the one band-angle→course-space mapping
  (lefty mirror included) shared by sectors, labels and blocked zones.
- **Blocked zones shade the cone from the sim's own flight walks (GS-spray-block + GS-spray-block-2,
  `round.ts sprayBlocking` + `flight.ts flightBlockedBy` + `tents.ts tentFlightHit` + `holeView.ts`).**
  The slices of the cone a tall obstacle would interrupt are shaded dark (`BLOCK_FILL`, dashed edge, a
  🌲/⛺ glyph — `BlockedRegion.src`, 'tents' only when no tree contributes — when the region is big
  enough in px); the clear remainder keeps its bands — that's the safe line. The probe is THE SAME
  code path the sim resolves shots with: trees via `flightBlockedBy(flightObstacles(hole), …)` (the
  path `flightKnockdown` delegates to) and trade-camp tents via `tentFlightHit` — tents are passed in
  (`opts.tents`, from `tradeTents(hole)`) only when the trade-market effect is armed, mirroring
  `executeShot`'s gate and check order (trees first). Per angle the read is BINARY
  (GS-spray-block-2, replacing v1's per-landing radial bands that drew floating mid-cone patches
  with misleading "clear" rims beyond a blocking grove):
  the landing radii are scanned short→long, and (a) if EVERY landing in the window flies clean over
  everything on that line, the line is CLEAR — no shade however tall the scenery it sails over; (b) at
  the FIRST interruption the line is blocked from the impact carry (where the ball actually comes
  down — the object, not the aimed landing) out to the cone's FAR edge — the whole rest of the slice
  reads dead, no clear pocket beyond the object. So an unshaded landing is exactly one the sim lets
  through, and a shaded slice always starts at a real knockdown/bounce; the far part is deliberately
  conservative (a flyer that would individually clear the object is a pleasant surprise, never a
  hidden wall). Including the curve: a sprayed shot launches along the BEARING and bends out, so a
  grove's blocked run is WIDER than its straight-ray shadow — that's the physics, not a bug. Pure,
  zero rng, display-only; holes with no trees and no armed tents early-return `[]`. The mask is
  SMOOTHED so it reads as intent, not noise, with thresholds the renderer derives from projected px
  (the same GS-spray-zoom scale-honesty): intervals shallower than `minDepthYd` drop; a near edge
  within `snapYd` of the near carry arc snaps onto it (no 1px open rim); angular runs closer than
  `mergeGapRad` merge (lerped through the gap — no barcode striping) and runs narrower than
  `minSpanRad` drop (no 1px blockers). `ShotSpread` gained `nominalCarry` (and later `flight`, the
  club family's `FlightProfile` — GS-flight-3) so the overlay drives the same loft/apex model the sim
  resolves: switching driver → 7-iron visibly changes what reads blocked. Guards: `tests/spray-blocking.test.ts` (physics agreement for trees AND tents,
  block-to-far-edge, fly-over-clear, tent gating, sliver drop, gap merge, render glyphs).
  GOTCHA: `sprayBlocking` runs per decision re-render (every drag frame) — it's ~3ms worst-case on a
  grove-heavy hole (the first-hit break makes blocked slices cheaper than v1); keep the probe budget
  bounded (samples clamp 16–72 angles × ≤16 radii) if you ever widen it.
- **Shot POWER + the pull-to-power gesture (GS-power).** Distance is now POWER-dependent: a shot's
  intended carry is `clubDist(club) × carryMult × power`, where `power` is a fraction of the club's
  full carry — 1 a full swing, down to a soft tap, and (with Overdrive) PAST 100%. It's a SINGLE pure
  scalar threaded `ShotInput.power → resolveShot` (multiplies `intended`), `ExecOpts.power →
  executeShot` (also scales the wind-comp carry), `shotSpread(opts.power)` (the preview cone), and
  `ShotDecision.power → takeShot/previewShot` and the `shot` reducer action. CRITICAL determinism:
  power adds NO rng draws and the angular spread (`prof.lateralFrac`) is keyed off the club's NOMINAL
  carry, NOT `intended` — so the *angle* is power-independent and the cone scales in YARDS with power
  (a soft shot's cone is small, a full swing's is the full cone — "draw on the power to expand the
  cone"). Default `power = 1` everywhere, and the AUTO sim ALWAYS plays full swings (never sets power),
  so `playHole`/`simulateRun` and every existing test are byte-for-byte unchanged — the whole 435-test
  suite stays green, and a windless half-power shot lands EXACTLY half as far per-sample (same rng,
  everything scales linearly). Power is INTERACTIVE-only: the player dials it with the gesture below.
  **Overdrive** (`loadout.overpower`, a stackable epic shop perk, +0.1 ceiling/copy to 1.2; helper
  `maxPowerOf(loadout)`) raises the UI's power ceiling past 100% for overpowered shots — the sim
  accepts any power, the loadout just sets the clamp. Rebuilt from perks on resume (no save bump).
- **The unified pull-to-power shot gesture (`wireShotGesture`, app.ts) — aim+power as ONE action.**
  Replaced the old aim-then-pull-the-button flow (the segmented Attack/Safe/✋ control + the swing-pad
  over the Hit button + drag-to-pan, all REMOVED). On the decision map: press anywhere, drag DOWN to
  charge POWER (the spray cone grows live via `previewShot(power: selPower)`), slide sideways to AIM
  (nudges `selAimBearing` by `AIM_SENS` deg/px; `selFreeTarget` is a point along that bearing — only
  the BEARING feeds the sim now, distance comes from club×power, so no unproject is needed), then
  release to FIRE. `selPower` starts at 0 on press, so releasing with power < `COMMIT` (a plain TAP,
  or a charge pulled back up) CANCELS — a stray touch never fires, and "slide back to reset" works.
  Two fingers PINCH-zoom (kept); overview toggle + ＋/− zoom buttons kept. The map framing uses a
  STABLE full-power spread (`frameSpray`, `power: 1`) so the camera holds steady while the cone
  grows/shrinks within it (no zoom-while-charging). A `.gs-power` HUD shows the live %/aim. The Hit
  button is GONE (GS-fullmap) — the pull IS the trigger (a mouse drag covers desktop). Pure feel — the
  sim is untouched (the gesture only chooses club+target+power), so determinism + all sim tests are
  unaffected; verified eyes-on (Playwright: a tap doesn't fire, slide-back cancels, a full pull fires,
  the 40%-charge cone is carry 53–116 vs the full 132–290). The `swingGesture` setting is GONE (the
  pull is the core input now). NB: no new `_gs*` flag or `?param` — gesture tunables (`PULL_RANGE`/
  `AIM_SENS`/`COMMIT`) are plain consts and Overdrive/power are loadout/decision fields — so the
  test-hub guard needs no new control (the new perk appears in the Sim Lab automatically).
  - **The AT-REST preview power is SEEDED to land the cone on the target, not always a full swing
    (GS-power short-shot fix).** On a NEW shot `selPower` no longer defaults to a flat 1 — it's
    `clamp(0.25, 1, distToPin ÷ the selected club's full expected carry)`, so the resting green/amber/red
    cone sits ON the pin instead of flying way past it. The bug it fixes: a short chip (where even the
    shortest club at full power overshoots the green) drew the arc "nowhere near where the ball lands."
    A normal approach (target past the club's reach) clamps the ratio to 1 → a full swing, exactly as
    before, so longer shots are unchanged. The gesture still charges from 0 on press; this only sets the
    untouched resting preview. `frameSpray` stays `power:1` so the camera frame holds steady as you pull.
  - **Pinch-zoom must NOT trip the pull-to-shot (GS-mapnav fix).** The first finger no longer charges
    on touch — it starts PENDING and only ENGAGES a charge once it drags past `ENGAGE_SLOP` (6px). That
    window lets a quickly-following SECOND finger be recognised as a `pinch` first (a second pointerdown
    sets `pinch` + clears `pending`), so two-finger zoom — the natural zoom gesture — never fires a shot
    or flickers the cone. GOTCHA: the stale-pointer clear that drops a dead gesture's leftover pointers
    keys off `active`/`pinch`; a PENDING finger looks idle, so it's only cleared once OLDER than
    `STALE_MS` (700ms, via `gestureStart = performance.now()`) — otherwise the clear would drop the first
    finger and misread a genuine pinch's second finger as a fresh single-finger charge (never reaching
    `size===2`). Verified eyes-on (Playwright synthetic multi-touch: a single-finger pull fires; a
    two-finger pinch zooms — `mapZoom` changes — without charging or firing). Still pure feel, no hook.
- **The play screen is a FULL-BLEED immersive map (GS-fullmap) — the hole IS the screen.** The old
  fixed column (top stat bar + map + bottom control row) is gone; the map fills the whole viewport
  (`.gs-shot--full` + `.gs-main--bleed` drops the page frame's padding) and every control/readout
  FLOATS on it as a translucent `.gs-glass` overlay: a top-left info chip (`mapTopInfo` — hole/par/
  distance/score + a thin lie·wind line + the momentum pips; the verbose biome/conditions string was
  cut, only an armed lost-rough warning survives), the top-right map-nav column, and a bottom control
  panel (club ◄►, the power HUD, the condensed spray odds, Sam's read). The big Hit button + the
  Attack/Safe/Aim segmented row are REMOVED; the only shot input is the pull gesture, plus a small
  round `»` auto-finish button. CRITICAL pass-through: the overlays are `pointer-events:none` so a
  power pull can START anywhere on the map — even under a readout — and only real buttons (and the
  putt-meter canvas) capture taps; the framed caddy badge is explicitly kept pass-through. The ball
  bias eased to `DMAP_BIAS 0.72` so it reads ABOVE the bottom panel, not behind it. Applies to the
  decision, watching, and putting screens (the hole-complete card stays a normal centred layout).
- **The hired caddy is shown FRAMED on the decision screen (GS-fullmap), and on the putting screen for a
  putting caddy (GS-caddy-display).** A gold-bordered glass badge (`caddyBadgeHTML` → `.gs-caddybadge`)
  draws the caddy's figure (the same `drawCaddy` the play view uses) with its name, so the caddy stands
  out the whole hole. Drawn one-shot per render via a generic pass over every `canvas.gs-caddycv[data-caddy]`
  (the idle bob updates live while charging, so no rAF to leak); each badge carries its caddy id in
  `data-caddy`, so the decision and putting screens share the one draw loop. Absent when there's no
  relevant caddy (decision: no caddy hired; putting: no putting specialist). Verified eyes-on. GOTCHA:
  `.gs-hud-bottom` is `align-items: flex-end` (NOT `stretch`) so the badge + round `»` button sit at
  their NATURAL height, bottom-aligned to the controls column — `stretch` ballooned the gold frame to
  the controls' height, leaving a tall empty band above the figure ("caddy frame too tall for the
  graphic"). The top info chip + bottom control panel are also kept tight (small padding/gaps) so they
  occlude as little of the shot-range cone behind them as possible.

- **The scene builder is CAMERA-PROOF: rng consumption + posHash keys never read the projection
  (GS-gesture-jitter fix, 2026-07).** The bug: while pulling to shoot (and any time the follow-cam
  moved), tree details, lava fissures and other decor "jerked wildly back and forth", stopping the
  instant the finger lifted. Two mechanisms, both "the scene rebuilds per frame through a moving
  projector" (follow-cam rebuilds `buildScene` per frame; the pull gesture used to wobble the
  decision map's `viewRadius` every frame — see ui-intro.md):
  (1) **View-dependent rng DRAW COUNTS.** The tuft/flower retry loops skipped candidates that
  projected off-view (`inView`) and re-drew; `archetypeDecor`'s `groundPt` retried the same way;
  fescue sized its blade count off the PROJECTED patch bbox; the cetus cliff dust count off the
  projected face. A sub-pixel camera change flips one candidate's visibility (or steps one count)
  → every draw downstream on that stream re-rolls → the whole scene (trees, water, lava live on the
  same main `rng`) teleports each frame. Fixes: placement rejects ONLY on course-space tests
  (`onGrass`), all per-item draws are consumed unconditionally, and visibility is decided at PAINT
  time (off-view pieces just aren't pushed); fescue runs on a per-patch local stream
  (`hashHole ^ posHash(centroid)`) so its px-scaled count is contained; cliff dust always consumes
  its capped 110 draws and pushes the first `dust`. Consequence: decor is now genuinely
  WORLD-anchored — a zoomed view shows the accents that live there rather than re-rolling the whole
  budget into frame (slightly sparser when zoomed way in; correct trade — stable beats
  dense-but-teleporting).
  (2) **posHash keyed off PROJECTED px.** `posHash` is a sin hash — a 0.001px input change is a
  different value — so flora details (mushroom spots, snag lean/embers, palm bend/fronds/coconut,
  saguaro arm/bloom, sea-stack speckles), decor accents and the OB warp-beacon bob re-rolled under
  any camera motion. All re-keyed to COURSE-space anchors (the flora fns take the course centroid
  `key`; `groundPt` returns `{c, s}`; the beacon hashes the course stake). THE RULE: posHash input
  = course space, always. `tests/camera-stability.test.ts` machine-checks both mechanisms (prim
  structure identical under a panned+zoom-eased projector across all archetypes; a pure pan
  translates flora details rigidly; `fitSpray` holds the whole-map fit still while the live cone
  changes). Byte-level note: localizing fescue + the flower-dot reorder shifted the art streams
  once (deterministic reshuffle, gallery re-shot — all worlds keep their identity).
- **Rough is ROUGH; space starts at the OB frame (GS-rough-frame, 2026-07-01,
  `style.ts`/`palette.ts`).** Player report: "the biomes' rough has somehow become starfields and it
  looks hella weird." Root cause was two GS-stellar decisions compounding: `LAND_SPACE_BLEND = 0.62`
  pulled every world's in-bounds rough 62% toward its deep-space base, and a `crng` "ground-star
  salt" loop sprinkled stars over the land — so ALL playable rough read as the starfield, i.e. as
  OB you could somehow play from. Worse, the land hull hugged the hole geometry (bbox + ≤36yd)
  while the OB box runs 40–90yd out, so a ball between the shoreline and the stakes visually lay
  "in space" but played as rough. The fix makes the graphic the physics again:
  (1) **`LAND_SPACE_BLEND` 0.62 → 0.12** — the land fill is the world's rough palette near-verbatim
  (a whisper of space base keeps the night mood); the rough-tone patches/tufts now read as turf
  texture on turf. (2) **The land hull = `playBounds` + a 7yd apron** (`landPad`), so the rough
  fills every in-bounds yard and DEEP SPACE + the starfield start exactly at the dashed OB line;
  the stakes stand ON the land rim (hull corner radius capped at `3·landPad` so the rounded corner
  never cuts inside the OB rectangle — beyond ~3.4·pad the arc would strand corner stakes in
  space). The old "wall-to-wall green in the zoomed play view" objection is retired deliberately:
  in-bounds ground SHOULD look like ground; the sky still reads on the whole-hole map and beyond
  the frame. (3) **The island-green treatment generalised to every ARMED lost-rough hole**
  (`lostHole`, was par-3-only `islandHole`): when the `roughLie` biomeMod is armed (void/cetus,
  wildness ≥ `LOST_ROUGH_MIN_WILDNESS`) there IS no rough — each fairway piece + the tee becomes
  its own land platform (`offsetPoly` margins) and the open deep reads everywhere off them, which
  is exactly the lost-ball rule the sim plays. A CALM void/cetus stop (penalty un-armed) keeps the
  normal rough landmass, so forgiveness is visible too — the render now mirrors the generator's
  arming gate instead of showing "space either way" (generate.ts comment updated). (4) **Ground-star
  salt deleted** (the `crng` loop; `windStreaks` values shift once — deterministic reshuffle, gallery
  re-shot). (5) **The void's deep got its "negative energy" look**: dark lens-shaped RIFTS
  (`#020106` fill, violet rim + glow) with energy wisps spiralling INWARD (alpha ramps dim→bright
  toward the rim so the flow reads as falling in), on the void's dedicated decor stream in the
  archetypeDecor 'void' case — course-space placement rejected off the land platforms, sized before
  the paint cull, shape off course-space `posHash`, so they drift between an armed hole's islands
  and beyond a calm hole's OB frame (camera-proof per the decor rules). Machine-checked in
  `tests/biome-identity.test.ts` ("rough vs the starfield"): the blend stays rough-dominated, the
  OB corners sit inside the drawn land hull on a normal world, an armed void hole draws ≥2
  platforms with the OB corners in open space, a calm one draws exactly 1 hull, and the rift fill
  appears on armed void holes.
- **GS-rough-frame follow-up: the ANIMATED starfield + sky-dark rough ramps (2026-07-01, second
  pass).** Player re-test after the first GS-rough-frame deploy: "crystal and lava biomes still are
  showing starfields and not rough." Two residual causes the static gallery could not show:
  (1) **The animated weather layer pinned a 60–180-star twinkle field across the WHOLE play view**
  (`weather.ts drawStars`, screen-space, every frame) — correct when the ground WAS space, but now it
  re-painted the starfield over the playable rough live, worst on dark-rough worlds where white
  twinkles read as stars, not sparkle. Fix: `WeatherOpts.starMask?: () => Vec[][] | null` — screen
  polys the PINNED stars must stay out of, queried per frame. The mask's land source is the new
  exported `landPolysCourseFor(hole, rainbow)` in `style.ts` (hull to the OB frame / lost-rough
  platforms / `[]` on Rainbow Road) — the SAME helper `buildScene` now draws from, so the drawn
  ground and the star mask can never disagree. `playView` feeds it through the LIVE projector (the
  follow-cam pans; the mask tracks). The aim/putt overlay (`app.ts mountWeatherOverlay`) can't
  project an exact mask (its local projector is wind-orientation only, not the SVG map's fit), so it
  blanket-masks the whole overlay on land-dominant holes (non-lost, non-rainbow) and leaves lost/
  rainbow unmasked. ONLY the pinned stars mask — the shooting star, meteors, debris and the ambient
  biome air keep drawing everywhere: motion sells them as sky above the world. Differential-tested in
  `tests/weather-mask.test.ts` (a proxy no-op ctx counts `arc` calls: full mask < bare, null ≡ bare).
  (2) **Half the rough ramps were nearly as dark as their own night sky** (`ARCHETYPE_TURF`:
  inferno #3a1410, crystal #2c3a55, fungal #1d1438, ocean #164656, tempest #343841, frost #3a4a55,
  void #120a22, cetus #132a3c) — with the land now only rendering where it's PLAYABLE, a sky-dark
  rough just reads as more starless OB. All eight lifted to clearly-ground tones (inferno → cinder
  earth #532c20, crystal → indigo-slate scree #41506e, void/cetus calm-stop rough lifted too — the
  abyss look lives on the ARMED platform holes now, so the calm rough may read as soil);
  `BIOME_ROUGH` re-synced; pure-WHITE wildflower dots removed from dark-rough worlds' `ACCENTS`
  (white specks on dark ground = stars by another route; verdant keeps its daisies). THE RULE,
  machine-checked in `tests/biome-identity.test.ts`: every archetype's `rough.base` must sit ≥30/255
  mean-channel brightness above its `ARCHETYPE_SPACE.base`. Gallery re-shot; `sw.js` VERSION bumped
  (gs-pwa-4).
- **GS-ground-cover: the rough wears the biome's actual ground COVERING (2026-07-02).** Player
  re-test after the second GS-rough-frame pass: "the rough still doesn't look like ground and it's
  really weird with hazards like lakes just in the middle of nowhere… it needs to look like proper
  ground covering matching that biome — snowy/frosty for frost, sandy all-bunker rough for
  beach/ocean, mossy/fungus coverings for fungus… except Cetus and Void." Diagnosis: the ≥30/255
  brightness rule made the land *brighter* than space but several ramps were still night-tinted
  slabs (frost slate-blue #485a68, ocean deep-teal #1d5668, fungal dark-purple #2c1f50), and a flat
  slab with a handful of decor pieces has no surface TEXTURE — so it still read as sky, and a lake
  drawn on it read as floating in nothing. Two-part fix, both render-only:
  (1) **Rough ramps become the covering's colour** (`ARCHETYPE_TURF.rough` + `BIOME_ROUGH` re-sync):
  frost → bright SNOWFIELD #dce9f2 (the frosted-teal corridor is mown *through* snow — the one ramp
  now deliberately LIGHTER than its fairway), ocean → open BEACH SAND #cfba85 (the island off the
  turf is one big strand; distinct from bunker #e9d8a6 so the excavated family drawer still reads),
  fungal → MOSS carpet #3a6446, inferno → ASH & CINDER #594238, desert → dune sand #85683a,
  crystal → shard-gravel scree #5a6680, tempest → rain-soaked moor #4d5945. Verdant byte-identical;
  void/cetus untouched (their own rules).
  (2) **A dense ground-covering texture pass** (`style.ts GROUND_COVER` table + `groundCover()`,
  buildScene section 4b): per-archetype tonal mottle patches (soft 7-gon blobs, posHash-wobbled,
  sized in YARDS via `proj.scale`), fine grain flecks (snow crumbs / shells / lichen / cinders /
  gravel), optional COHERENT combing ridges (one per-hole grain angle: snow drifts, dune ripples,
  tide-rake, rain-flattened grass) and rare sparkle glints (ice / ember / prism) — scattered over
  the LAND-HULL bbox (playBounds+apron, wider than the features bbox so the covering reaches the
  OB corners), rejected off the cut grass with bounded course-space attempts, clipped to the land,
  culled at paint. All on a NEW dedicated stream (`hashHole ^ 0x006c0de5`) so every existing stream
  (`rng`/`crng`/cetus/decor) is byte-for-byte untouched; gated `!rainbow && !lostHole` and by row
  presence (void/cetus have NO row by design — machine-checked). Counts key off the course-space
  land span only (camera-proof; `tests/camera-stability.test.ts` stays green). Guards added to
  `tests/biome-identity.test.ts`: full row coverage except void/cetus, frost mottle+sparkle and
  ocean grain+ridge colours present in the SVG, byte-determinism. This also resolves the
  "lakes in the middle of nowhere" read: the hazards were always ON land — the land just didn't
  look like land. Gallery re-shot.

## GS-hazard-blend: union-merged hazard families + fold-proof platforms (2026-07)

- **`render/merge.ts`** is the grid geometry engine: scanline-rasterise polys onto a small course-space
  node grid → optional chamfer-DT dilation → marching-squares contour trace → decimate + Chaikin smooth.
  Pure, zero rng. Two exports:
  - `unionPolys(polys)` — true union; bbox-cluster union-find first, so ISOLATED bodies return their
    exact original vertices (identity fast path) and only genuinely touching clusters rasterise.
  - `dilateUnion(polys, pad)` — union of the polys grown by `pad`, rounded corners, can never fold.
- **Sand + liquid families draw MERGED bodies.** `mergedHazardsFor(hole)` (WeakMap-cached per hole)
  unions each family's polys in COURSE space; `styleSandFamily`/`styleLiquidFamily` receive the merged
  loops, so touching bunkers/pots/waste read as ONE excavated complex with a single lip-shadow +
  depression crescent, and a creek + its mouth lake as one water body with one shoreline. Course-space
  merging keeps the merged-body COUNT camera-proof (the liquid pass draws rng per body — a screen-space
  union could flip counts under zoom and shift the shared stream). Known, accepted edge: a fully
  ENCLOSED turf pocket inside a merged ring would paint as the family surface — geometrically near
  impossible with the game's blob patterns, noted in `merge.ts`.
- **Lost-rough platforms are `dilateUnion(fairways+green+tee, 14)`** (`lostPlatformsCourse`, cached).
  The old mitred `offsetPoly(poly, -14)` outset SELF-INTERSECTED at concave ribbon bends — the flipped
  winding left the fold unfilled, which was exactly the Cetus "star gap between the fairway and the
  border". Including the GREEN fixes the other seam (a green fatter than the corridor nose used to
  overhang the deep), and the union joins touching pads into one continuous platform (tee melts into
  the corridor). Guarded by `tests/hazard-overlap.test.ts` (every play-feature vertex on-platform) +
  `tests/render-merge.test.ts` (no-fold, coverage, merge/separate cases).
- **`archetypeDecor` pushes UNCONDITIONALLY — no paint-time `inView` culls.** A decor piece sitting
  exactly on the view edge flipped the prim COUNT between two follow-cam frames (the camera-stability
  guard caught it when the generator change legitimately moved decor). Decor is a few dozen cheap
  prims; off-view pieces drawing nothing beats the flake. rng consumption was already unconditional.
- **Cetus star-river reads as a RIVER (GS-cetus-7).** Wider channel (`rw` up to 11 yd), ONE broad
  S-lobe per ~145 yd (the old tight wiggle at creek width read as "an electric eel"), calm banks
  (12% width wobble), a widening DELTA into the spill. The solid-white current spine is gone —
  replaced by broken bank-hugging filaments (pure geometry) — and the star fill is smaller/dimmer
  dust with rare hero halos. The WATERFALL is a LUMINOUS cyan curtain (the old dark-blue veil
  vanished against the dark cliff, leaving only streaks that read as dangling drips) + a bright
  brink line at the lip, streaks/droplets inside the curtain, mist + ripples at the foot. Same
  dedicated river stream; all draws stay unconditional (the `paint` gate only chooses pushes).
  `tests/cetus.test.ts`'s river sentinel colour updated (`rgba(60,150,205,0.7)`).
- **The star-waterfall MOVES in the play view (GS-cetus-flow, `render/cetusFlow.ts`).** The static
  `cetusRiver` (GS-cetus-7) is a printed decal — right for the SVG map, but a "starry waterfall"
  should FLOW. So the animated Canvas2D play view suppresses the static river (`SceneOpts.animateCetus`,
  set only by `playView`) and draws `createCetusFlow(hole)` over the scene instead: seeded star-motes
  DRIFT source→spill down the channel (fading in at the spring, out over the lip), the curtain's
  star-streaks FALL top→bottom, and the splash pool churns with expanding ripple rings. It reproduces
  the EXACT course-space channel `cetusRiverPath` emits (same `0x00cef10e` seed) so the flow sits on
  the same geometry the map prints; `fallLenFor` mirrors `platformCliffs`' cliff-height so the curtain
  reaches the same foot. Layered over the scene + weather but UNDER the ball/FX/HUD (the ball still
  flies clearly over it). **Determinism:** motion rides the play view's virtual clock (`now` ms), never
  an rng draw — no seeded stream is touched, and `animateCetus` off (the SVG map + every test) is
  byte-identical. **Perf** (the explicit worry — heavy cetus decor + follow-cam rebuilds): geometry is
  a pure fn of the hole, computed ONCE at mount in course space; each frame only re-projects a 24-pt
  polyline + advances ~90 capped particles — NO `buildScene` rebuild — and it REPLACES the equal-weight
  static river the follow-cam used to rebuild each frame, so it's perf-neutral. Flow rate rides a
  `_gsFeel.cetusFlowSpeed` sub-field (1 default, 0 freezes) — a feel tunable, no test-hub hook. Eyeball
  with `scripts/cetus-flow-preview.mjs`.

## GS-rough-cover-2 + GS-egg: rough that reads as rough, and easter eggs to find (2026-07-03)

- **The flat-slab roughs get characterful TUFTS (GS-rough-cover-2, `style.ts`/`palette.ts`).** Player
  report after GS-ground-cover: "make the rough still more rough — crystal, tempest, inferno lava
  biomes in particular don't actually look like rough." The GROUND_COVER pass gave every world a
  covering COLOUR + fine mottle/grain, but on those three the rough still read as a flat tinted slab
  (crystal a washed pale grey, inferno a red-brown wash, tempest a dark olive). Fix, render-only:
  `GroundCoverLook` grows an optional `tuft` ({`cols`, `style`}) + `density` multiplier, and
  `groundCover()` gains a 5th pass drawing raised little CLUMPS that give the rough 3-D texture —
  `blade` (leaning grass/reed tufts: moor, dune marram, desert dry-grass), `shard` (angular mineral
  splinters: crystal scree, frost rime-needles), `clump` (rounded tussock/cinder mounds: inferno ash,
  fungal moss). Blades share ONE coherent per-hole lean so a windswept moor / dune grain reads across
  the whole rough. crystal/tempest/inferno also carry `density` 1.5–1.6 (denser mottle/grain/tufts) +
  a touch more mottle contrast, so their rough now reads as crystalline gravel / smouldering cinder /
  wild moor grass instead of a slab. Sized in YARDS (clamped px), varied off course-space `posHash`
  (camera-stable per-clump prim count), drawn on the EXISTING dedicated `grng` stream — every other
  stream is byte-for-byte untouched, and worlds without a `density`/`tuft` are unchanged. NB: the
  inferno tuft's ember-fleck tone is a DISTINCT orange (`#ff7a1e`), not the snag-ember `#ff8a2a` the
  camera-stability test rigidly tracks — ground texture legitimately culls at paint (the established
  `groundCover` convention), so reusing the tracked decor colour would pollute its count. Guards:
  `tests/biome-identity.test.ts` (the three flagged worlds have tuft+density; the crystal shard tone
  paints). Gallery re-shot; verdant/void/cetus untouched.
- **Whimsical EASTER-EGG props hidden in the rough (GS-egg, `style.ts EGGS`/`easterEggs`).** Same
  report: "throw some beach settings around as easter-egg stuff not too close to the fairway/green…
  throw some random thematically-appropriate stuff into the other biomes too (except void/Cetus) —
  fun if you zoom out and look around the entire area." A new decor pass places a few of the world's
  whimsical props per hole: verdant (picnic blanket / gnome / duck pond), desert (cow skull / cactus
  in bloom / pyramid / tumbleweed), frost (snowman / igloo / penguin), inferno (mini volcano / charred
  stump / obsidian golf ball), crystal (geode / spire cluster / floating prism), tempest (wind turbine
  / weather vane / lightning-blasted tree), fungal (toadstool cottage / fairy ring / giant snail),
  ocean (beach umbrella+towel / sandcastle / beach ball / starfish+shells / surfboard — the beach gets
  the most, per the ask). Each painter gets a terse `EggPen` (`circle/line/poly/glow` + `h(k)`
  course-space posHash) and pushes a FIXED prim count so a prop is camera-proof (variety off `h`,
  never rng, never the projection; pushed unconditionally like archetypeDecor). Placement scatters
  over the LAND-HULL bbox on a DEDICATED stream (`hashHole ^ 0x00e99e66`), accepted only where
  `eggOk` holds — ON the land hull, OFF a 9-yd buffered cut-grass reject (`offsetPoly(feature,-9)` for
  fairway/green/tee), and OFF penalty liquids (a snowman in a lava lake reads as a bug; sand & trees
  are fine — a beach ball on the strand belongs). Props are ~4.8 yd (clamped 15–36 px) so they read
  both zoomed-out on the map AND in the follow-cam. Sized bigger + a few per hole (ocean 4–5, else
  3–4) so scanning the hole actually turns them up. Skipped on lost-rough holes (no rough to hide in)
  and Rainbow Road; void/cetus have NO `EGGS` row by design (their bespoke deep already reads great).
  Determinism/camera holds trivially (dedicated stream, course-space rejection, fixed-count
  unconditional pushes) — no existing stream moves. Guards: `tests/biome-identity.test.ts` (props for
  the playful worlds + none for void/cetus, determinism, corridor/liquid rejection, a beach-prop
  render integration). Eyeball with `node scripts/egg-preview.mjs` (large single-hole renders) or
  re-shoot `node scripts/gallery.mjs`.

## GS-inset: one light, carved features — holes read as one lit landform (2026-07-03)

- **Player report:** "the holes look like a bunch of associated art assets copy-pasted together
  instead of single unified holes — can we make inset bunkers, lakes and rivers look like they're all
  part of one hole." Diagnosis (code + a high-res gallery): the compositor gives only flat-fill polys,
  thin strokes, clipped bands and radial `glow`s — no shadow, bevel, gradient or blur prim. Every
  hazard was a flat blob ringed by a **same-tint** outset "shadow"/"shore" (which reads as an
  OUTLINE, not a depression) plus same-tint inset depth rings. Water's outset shore was even *lighter*
  than the body — a candy-bright halo, the exact opposite of a carved bank. Nothing cast a shadow onto
  its neighbours and there was no shared light, so the eye read a collage. The proven depth recipe
  already existed but was gated to cetus/void (`raisedShelf`/`platformCliffs`: a dark shadow cast on
  the ground + a contact band under the lip + a lit rim). GS-inset generalises that recipe — INVERTED
  into a depression — to the normal worlds' hazards. All render-only, pure geometry, **zero rng draws
  and zero stream reorders** (determinism contract #1 holds trivially), so the whole suite stayed
  green (870 tests) and void/cetus are byte-for-byte untouched.
- **One global light (`LIGHT_UL`, upper-left)** — matching the green's existing lit highlight and the
  cetus shelf — so every carved feature shades the same way. Two shared helpers in `style.ts`:
  `castShadow(poly, scale, fill)` (a soft dark shadow offset AWAY from the light onto the surrounding
  turf, so the feature sits IN the ground, not on it) and `embossChildren(poly, scale, {wall, base,
  floor?})`/`insetEmboss` (repaint the interior as a bowl: the whole rim drops to a shadow `wall`
  tone, the `base` is re-laid shifted toward the light so the NEAR/up-light rim keeps a shadow
  crescent, an optional lit `floor` pools sun on the far side). Sized in px off `proj.scale`, clamped
  to the body half-extent so thin creeks can't collapse; fixed prim count (camera-proof).
- **Sand** (`styleSandFamily`): a `castShadow` (`SAND.contact`) under every body grounds the bunker,
  then the old sandy lip + base, then `insetEmboss` with `{wall: SAND.wall, base, floor: SAND.rim}`
  (rim lifted brighter to `#f4ead0` — the sunlit far floor). **Water & lava** (`styleLiquidFamily`,
  now taking `proj.scale`): a `castShadow` (`lp.contact`) under, and the up-light **bank shadow** is
  `embossChildren` (wall = `WATER.bank`/`LAVA.bank`, no lit floor) drawn INSIDE the per-body clip
  BEFORE the depth rings — so the rings still repaint the deep core and the body reads as water sunk
  beneath its bank. `WATER.shallow` was dimmed from candy-cyan `#6fb3ec` → `#5f9ed6` and the glint
  alpha eased, so the shore reads as a bank, not a sticker border. The emboss is inlined as clip
  CHILDREN (never a nested clip — the SVG serializer bug). New palette keys: `SAND.wall/contact`,
  `WATER.bank/contact`, `LAVA.bank/contact`.
- **Greens** get a `castShadow` (`rgba(4,10,6,0.16)`) UNDER the fill on normal worlds (a putting
  surface sits slightly proud → a faint down-light drop shadow grounds it), skipped where a
  shelf/void-glow already models the edge, and on Rainbow Road. The flush fairway was deliberately
  LEFT alone — a cast shadow there would read as a floating sticker, the opposite of "mown in."
- **The land tone-patch "spotlights" were tamed** (`buildScene` §4): 5 screen-space tonal discs
  spanning up to 29% of the viewport at heavy alpha read as lens-flare washes pasted over the hole —
  the single biggest remaining collage tell once the hazards were fixed. Radius dialled to
  `(0.05 + rng·0.06)·min(W,H)` and alpha to `0.07`/`0.03` (soft mottle, not spotlights). Kept the
  SAME 4 rng draws per patch, so every downstream stream is byte-for-byte unchanged.
- Re-shot `node scripts/gallery.mjs` (all 10 worlds read as cohesive lit landforms; void/cetus
  identical). Known follow-up left open: the fairway is still a flat uniform-width bright tube — the
  most "object-like" element — but reshaping it is a generator concern, not render.

## GS-fairway: the corridor reads as mown INTO the land (2026-07-03)

- **Follow-up to GS-inset** (the fairway was the deliberately-skipped remaining tell). The corridor
  read as a bright uniform tube laid ON the rough, because its only edge treatment was a single
  LIGHTER first-cut fringe (`mixHex(fw, rough, 0.5)`) — a soft washy halo, not a defined mow line —
  over a flat single-tone fill. Two render-only additions in `styleFairways`, both pure geometry
  (**zero rng draws, zero stream reorders**):
  - **A first-cut ROUGH collar** — a wider outset band (`offsetPoly(sp, -6)`) UNDER the light fringe,
    toned mostly toward rough (`fwCollar = mixHex(fwShade.base, rs.base, 0.72)`) so the corridor sits
    DOWN in a graded fairway → first-cut → rough transition instead of meeting the rough on a soft
    bright edge. Grouped like the fringe (every collar under every base), so a broken corridor's
    segments share one continuous first cut.
  - **A gentle directional SHEEN** — a soft lit band (`hexAlpha(s.light, 0.16)`) pooled on the
    up-light side via `shiftPoly(offsetPoly(sp, 4), LIGHT_UL·4)` clipped to each segment, so the mown
    turf reads as gently crowned ground catching the shared GS-inset light, not a flat decal.
- **Gated to the parkland worlds** (`groundedFw = arch !== 'void' && arch !== 'cetus'`, passed as the
  optional `collar` param; Rainbow Road takes its own ribbon branch and never calls `styleFairways`).
  void/cetus edge their corridor with a glow rim / raised shelf, so a collar would fight it — they
  pass NO collar and `styleFairways` with `collar === undefined` is **byte-for-byte the pre-change
  output** (the whole suite, incl. the void/cetus determinism + camera-stability guards, stays green;
  870 tests). Ocean/frost/inferno/desert/crystal/tempest/fungal/verdant all pick the collar up: the
  first-cut takes each world's own rough tone (sandy on the beach, snowy on frost, cinder on inferno).
- Eyeballed high-res across verdant/ocean/frost/inferno (collar + sheen read as a cut corridor) and
  void/cetus (unchanged). Re-shoot `node scripts/gallery.mjs` after further `styleFairways` edits.
  The uniform-WIDTH read remains a generator concern (varying width / green taper), still out of scope.


## GS-green-contour-2 — the `path` prim + `render/contour.ts` (2026-07-05)

Two render-layer additions shipped with the contoured-greens upgrade (full story in `putting.md`):

- **`path` prim** — an OPEN stroked polyline (`<polyline>` in SVG; no `closePath` on canvas). A
  `poly` with `fill:'none'` still closes with a chord, so it must never be used for open curves;
  `path` is the right prim for any stroked open line. Supports `round` (cap+join) and `dash`.
- **`render/contour.ts`** — topo isolines of the sim's contour height field (`sim/contour.ts
  heightFieldAt`), marching-squares over a COURSE-space grid, exact-endpoint chaining, one Chaikin
  round. Each `Isoline` carries its elevation `frac` (0 low … 1 high) and `styleGreen` colour-codes
  off it in the biome's own green `Shade` — high rings light (toward white), low rings dark (toward
  shadow), void/cetus muted ×0.72 — so the colouring is biome-appropriate by construction. Fully camera-proof (grid/levels/chaining read no projection) and WeakMap-cached per hole in
  `style.ts`; only the projection runs per frame. Poly-agnostic on purpose: a future contoured
  fairway hands its own polygon + field to the same function. Lobe RELIEF stays in `styleGreen`:
  a directional glow pair per lobe under the shared `LIGHT_UL` (mound lit toward the sun; hollow
  inverted per the emboss rule).

## GS-inset-2 + GS-cetus-blend + GS-hazard-blend-2: the hazard-blending pass (2026-07)

Three refinements that make carved features sit IN the land instead of floating on it. All pure
geometry — zero rng draws/reorders, so void/cetus and every seeded scene stay byte-identical.

- **GS-inset-2 — no drop shadow onto turf.** GS-inset's first cut cast a shadow on the surrounding
  grass, which read as the feature FLOATING proud of the land (the "raised/bevelled outward" bug).
  The depression is now a THIN lip, not a big shadow blob: the emboss width `w` is capped HARD by
  the body radius (`half*0.14`) so it stays a slim rim at the zoomed-in PLAY scale — a
  scale-proportional band ballooned into a distinct dark shadow across a third of the feature, worse
  than the raised look it replaced. Sand drops its bright far-floor pool (the lit-pool-vs-shadow
  contrast was the hard "distinct shadow"). For the same reason the GREEN is FLUSH with the fairway
  (no cast shadow — only its own mown fringe/collar rings ease it in); the shelf/void-glow worlds
  still model their raised corridor edge. The emboss is inlined as clip CHILDREN, never a nested
  clip. Land tone-patches are small faint mottle, never viewport-spanning "spotlight" washes.
  Palette source: the `*.wall`/`*.bank` tones.
- **GS-cetus-blend — hazards ease into the turf; void/cetus mow stripes muted.**
  `styleSandFamily`/`styleLiquidFamily` each lay a soft grassy MARGIN just outside the body
  (`mixHex(rough, sand|shore, 0.42)`, grouped UNDER every body so a merged complex shares one
  seamless margin) — the land thinning toward the hazard, so a bunker/lake reads set INTO the ground
  instead of a hard-edged sticker. The margin is blended toward the HAZARD, never darker than the
  turf — a darker ring is a floating shadow, the GS-inset-2 lesson. Separately, void/cetus
  fairway+green STRIPES were retuned down: their wide light↔dark VALUE spread banded even a normal
  mow into discordant bright/dark stripes over the smooth luminous platform, so `MOW_BLEND` now
  mutes them BELOW parkland (void 0.4 / cetus 0.42, dark eased to `k·0.72` on every world) and
  `styleGreen` softens its stripe for those two worlds (0.52/0.36 vs the parkland 0.7/0.5) —
  parkland stays byte-identical.
- **GS-hazard-blend-2 — the hazard INTERNALS blend too.** Water/lava deepen through a SMOOTH ramp of
  feathered `offsetPoly` rings interpolating base→mid→deep (7 rings, shape-following — a river
  darkens toward its centreline, a lake toward its middle) instead of the 2 hard contour bands that
  read as a topographic map. Bunkers drop the harsh full-width white rake BARS for a smoothly shaded
  bowl: inset rim shadow + a soft down-light sunlit swell + faint rim-following rake arcs. The
  liquid flow/glint draws still consume the identical rng, so every seeded scene is byte-stable.

## GS-style-split: style.ts split into per-domain painter modules (2026-07-06)

**What:** `src/render/style.ts` had grown to ~4,270 lines — every painter, every helper and the
orchestrator in one file, the render layer's god-file the way `app.ts` used to be the UI's. The
GS-app-split treatment applied: `style.ts` (~820 lines) keeps ONLY the orchestration and the
per-domain painters moved verbatim into `src/render/style/` modules:

- `shared.ts` — the dependency ROOT (imports no other style/ module): the `Prim` vocabulary, the
  `ArtFeel`/`_gsArt` escape-hatch, `mulberry32`/`hashHole`, the small geometry kit (`bboxOf`,
  `offsetPoly`, `centroidOf`, `scalePoly`, `longAxis`, `projPoly`, `posHash`, `inView`,
  `hexAlpha`…), the four mowing-stripe fills and the shared `LIGHT_UL` inset light.
- `land.ts` — the land hull to the OB frame, the lost-rough `dilateUnion` platforms, the per-hole
  WeakMap caches of the union-merged hazard families, `landPolysCourseFor` (the weather layer's
  star-mask source).
- `fairway.ts` — grouped `styleFairways` + per-world mow patterns, `styleTee`, the Rainbow Road
  ribbon (grooved/shaded bands + crown sheen, GS-rainbow-polish).
- `green.ts` — `styleGreen` + the whole green-slope art pipeline (`greenSlopeArt`, projected
  lobes, the cached topo isolines).
- `hazards.ts` — the sand + liquid family painters (with `embossChildren`), scatter surfaces,
  fescue, per-world deep rough, ravine, and the `WATER_KINDS`/`LAVA_KINDS` classification sets.
- `flora.ts` — `styleFlora` + the eight per-archetype silhouettes, and `archetypeDecor`.
- `ground.ts` — the `GROUND_COVER` table + `groundCover` pass, and the `EGGS` painters +
  `easterEggs`.
- `platforms.ts` — the cetus/void depth kit: `platformCliffs`, `raisedShelf`, `cetusOcean`
  (whales), `cetusRiverPath`/`cetusRiver` (the star-river + waterfall), and the `CETUS_CLIFF`/
  `VOID_CLIFF`/`RAINBOW_CLIFF` looks (Rainbow Road extrudes its road onto a prismatic cliff too).
- `effects.ts` — tents/scorch/ground-patch showpieces, the wind streaks, the constellation
  backdrop, and `rainbowSky` (the Rainbow Road aurora + coloured stars, GS-rainbow-polish).

**The load-bearing rule:** `buildScene` (still in style.ts) owns the SEEDED STREAMS and their draw
order — main `rng`, celestial `crng`, and the dedicated ocean/river/cliff/cover/decor/egg streams
are all seeded and threaded there, in the exact pre-split sequence. Painters are pure functions of
their inputs; a painter module NEVER seeds a stream of its own and never imports style.ts (no
cycles — `shared.ts` is the root, `land.ts` sits under `platforms.ts` for `landPolysCourseFor`).
The public import surface is byte-compatible: consumers (`holeView`, `playView`, tests) still
import everything from `./style`, which re-exports `Prim`/`ArtFeel`/`landPolysCourseFor`/
`GROUND_COVER`/`easterEggs`/`cetusRiverPath` from the new modules.

**Verification (byte-identical, not just green):** beyond `npx tsc --noEmit`, both Vite builds and
the full 102-file suite (989 passing, incl. the seeded byte-stability, camera-stability and
biome-identity guards), a throwaway fingerprint harness hashed `buildScene` JSON + the serialized
SVG across 10 biomes × 6 seeds × 3 holes × 2 camera framings × 5 SceneOpts variants (base/theme/
rainbow/effects/art-off) — 1,800 scene hashes plus `landPolysCourseFor` and a fixed-stream
`cetusRiverPath` probe — before and after the split: **identical to the byte**. The gallery was
re-shot and eyeballed across all ten worlds.

**Drive-by:** `scripts/gallery.mjs` now probes a LIST of Chromium candidates and falls through on
launch failure (full chromium → headless shell → system Chrome/Edge, each platform's layout): on
the Windows dev box the Playwright full-chromium download ships a broken side-by-side manifest
(spawn UNKNOWN) while the headless shell runs fine — and merely existing on disk doesn't mean a
binary can launch.

## GS-fairway-2: the fairway art smoothing pass (2026-07-06)

**The ask:** greens and hazards had had their blending passes (GS-green-contour-3,
GS-hazard-blend-2); the fairway was the surface left behind — "looking a bit average". Close-up
shots confirmed three tells, all in `styleFairways`:

1. **The cut was a 3-step staircase.** Collar (−6) → fringe (−3) → base butted at hard tone jumps —
   concentric-sticker rings, the same "ruled tape" tell the mowing bands had before GS-mow-blend.
   Fix: one intermediate mix ring between each step (`mixHex(collar, fringe, .5)` at −4.4,
   `mixHex(fringe, base, .5)` at −1.5), halving every jump into a smooth rough→collar→fringe→turf
   grade.
2. **The interior was one flat tone.** Fix (a): an EDGE-EASE — two nested inner strokes
   (`mixHex(s.base, fringe, 0.4)`, sw 9/4, clipped to the segment) so the mown turf ramps into its
   own mow line from whichever side the fringe sits (lighter on sandy worlds, darker on parkland).
   Strokes, NOT deep filled insets: `offsetPoly` insets bigger than the local half-width FOLD on a
   thin ribbon, while a clipped stroke hugs the edge safely at any width/zoom. Fix (b): the single
   hard-edged 0.16 sheen band became TWO stacked softer washes (insets 3/6.5 shifted along
   LIGHT_UL, alphas 0.09/0.08) so the crown light grades in instead of switching on at a line.
3. **The mow was invisible on narrow-spread palettes.** Verdant (`#3f8c3f`↔`#56a850`), desert and
   ocean mowed at a whisper while frost read best precisely because its grain showed. The parkland
   `mowTones` default lifted 0.5 → 0.6 — still far below the full-contrast "Beetlejuice snakes"
   look the blend was introduced to tame; the dark cut keeps its 0.72 ease and the void/cetus
   `MOW_BLEND` overrides (0.4/0.42) are untouched.

**Guarantees:** all pure geometry, zero rng draws, fixed prim counts (camera-proof); every addition
gates on `collar`, so void/cetus (no collar — glow rim / raised shelf) and Rainbow Road are
byte-for-byte identical. Full suite green (1009 tests); gallery re-shot across all ten worlds and
play-zoom crops eyeballed on verdant + desert (smooth grade, no facets, no sheen line).

## GS-rainbow-polish: the Rainbow Road becomes its own complete world (2026-07-07)

The legendary Rainbow Ball (GS-rainbow) turns every hole into RAINBOW ROAD — a rainbow ribbon
through the stars, off-road = OOB. Player feedback after shipping it, three parts:

1. **The watch screen showed the ORIGINAL course.** The result-screen play view passed
   `rainbow: rainbowActive()`, but the INTERACTIVE watch view (the `animatingPlay` `mountPlayView`
   in `app.ts`, the one you see the moment you strike the ball) did not — so the ball flew over the
   ordinary biome while the decision map showed rainbow road. One-line fix: thread
   `rainbow: rainbowActive()` into that call too (both mounts now match). The play view already
   built the rainbow scene and masked its animated starfield correctly (`landPolysCourseFor(hole,
   true) → []`, stars everywhere off-road) — only the flag was missing.
2. **The bands read flat/"rough" — no shading or blending.** `rainbowRibbon` painted hard poster
   stripes. Now each band is GROOVED (a lit top lip `mixHex(col,#fff,.55)@.5` + a shaded bottom
   `rgba(6,4,18,.28)`, so adjacent colours meet on a soft ridge, not a printed seam), the whole
   surface takes the shared LIGHT_UL CROWN SHEEN (two soft up-light washes) and an inner edge shade
   (`rgba(6,4,18,.30)` sw5) that darkens toward the rails — so the road reads as a crowned glowing
   track. Still pure geometry, zero rng.
3. **Give it the Cetus/Void layered-cliff treatment + its own starfield.** Two additions, both
   gated to `rainbow`:
   - **Layered cliff.** Each play surface (fairway/green/tee) is now extruded via the SAME
     `platformCliffs` the lost-rough worlds use, with a new `RAINBOW_CLIFF` look (a lit magenta
     brink fading through violet into the deep). Drawn FIRST (behind every ribbon — the ribbon caps
     each plateau) off the dedicated `cliffRng` (previously unused on the rainbow path, so no other
     stream is perturbed). The road now floats as a raised prismatic mesa with real side-on depth.
   - **Bespoke starfield.** A dedicated `RAINBOW_SPACE` deep-space look (indigo-violet cosmos,
     prismatic shore rim) replaces "whatever biome recoloured", plus a `rainbowSky` painter — soft
     prismatic AURORA curtains bowing across the upper sky + coloured hero stars — drawn OVER the
     shared starfield off its OWN stream (the shared celestial `crng` stars/planet/comet stay
     byte-identical) and camera-proof (fixed loop counts). So Rainbow Road reads distinct from
     Cetus's blue star-ocean and the Void's violet abyss.

**Guarantees:** every addition gates on `rainbow`, so all ten archetypes are byte-for-byte
unchanged (the camera-stability + biome-identity suites, which never arm rainbow, stay green). No
new `_gs*`/`?param` hook (rainbow is baked from the loadout at the app boundary), so the test-hub
guard is untouched. Full suite green (1033 tests); `scripts/rainbow-preview.mjs` added and eyeballed
across verdant/inferno/frost.

**GS-rainbow-road-2 follow-up (wide road, no hazards, prismatic pillars).** The polish above still
drew the biome's THIN corridor, so a good shot rolled off into the void, and it kept the biome's
bunkers/seams. The geometry fix lives in the sim (`applyRainbowRoad` widens the road + clears hazards
in `currentCourse`; see competition.md), so the renderer just draws the wider hazard-free hole. Two
render-only touches here: the green + tee ribbons ride the SAME band grid as the fairway (`rainbowGrid`
computed once in `buildScene`, reused in the feature loop) — one continuous track, not three
separately-phased blobs; and `RAINBOW_CLIFF` (`style/platforms.ts`) is recoloured to a prismatic
jewel-hue descent so the support pillars stop reading as a Void asteroid copy. Both gated on `rainbow`.

## GS-chip-cone / green-render batch — decision-lag, apron, all-biome contours, rough fit (2026-07-07)

A play-test batch off two screenshots ("close putting/chipping still laggy", "green apron over the
fairway", "not all biomes got contour overlays", "wedges chip weird distances / arc overlay too long or
short", "deep rough & −28% hazards don't fit the biomes"). Five fixes, each isolated; all pure render
except the chip-cone one (preview-only, no sim rng). Full suite stayed green (1033).

- **Decision-lag — the shot cone redraws WITHOUT the scene.** The putt aim-nudge lag was fixed in #281,
  but the SHOT-DECISION screen still called a full `render()` on every rAF frame of the pull-to-power
  drag (`applyDrag → scheduleRender → render`), rebuilding the ENTIRE `buildScene` (flora, the heavy
  GS-rough-gradient rough, green contour art, isolines) + reserialising a big SVG string per frame —
  brutal on close chips/putts where the map is zoomed in and pinch-zoom re-rasterises each swap. Only
  the aiming spray cone (+ power/legend HUD) moves per frame. Wrap the cone in a stable-id group
  (`<g id="gs-shot-overlay">`), share its drawing via `shotConeParts()` so the full render and a new
  `renderShotOverlaySVG()` are byte-identical, and have `applyDrag` swap just that group + two HUD spans
  in place (`shotAimRefresh`). FOCUS/FOLLOW mode only — the camera is framed on the stable full-power
  spread and holds still for the whole decision, so the overlay re-projects against the SAME framing;
  whole-hole fit mode has no stable focus projector → `null` → full render. A `holeView` test asserts the
  overlay group is byte-identical to the same group inside a full `renderHoleSVG`; a real-browser drive
  confirmed the scene's first polygon is unchanged during a pull (no rebuild), the cone/HUD update, zero
  console errors. The sibling of the #281 putt-overlay swap.
- **Green apron no longer paints over the fairway.** The green's fringe/collar are OUTWARD offset rings
  (`offsetPoly(poly, −6.5/−3.4)` grow the poly) meant to ease the green into the ROUGH, but they drew in
  the feature loop AFTER the fairway pass — a green at the end of a fairway ribbon painted a dark apron
  ring ON TOP of the bright fairway. Split those two rings out (`styleGreenSurround`) and draw them UNDER
  the fairway pass; the fairway covers them at the green/fairway seam (its own collar handles that
  junction), so the apron only shows in the rough. The green surface stays flush, on top.
- **Contour relief on EVERY biome.** The relief map was gated on the fall-line ARROW field, which only
  emits for cells steeper than 0.06 — so a gentle green on a low-`greenSlopeMax` world (frost/ocean at a
  calm stop) had zero arrows and fell through to the flat legacy look. Every sculpted green has topo
  ISOLINES (the generator gives each green ≥1 lobe on its own side stream; `contourIsolines` floors at 3
  rings for any amplitude), so gate `contoured` on isolines instead — the relief now renders on every
  biome; the chevrons still correctly stay OFF near-flat crests. (Rainbow Road still takes its own ribbon
  branch and draws no green contour — deliberate, its unique look.)
- **Rough/hazard blobs fit every world.** `styleFescue` hardcoded an olive body + tufts with no archetype
  arg, so the SAME olive grass drew on frost snow / crystal scree / indigo void / ocean dune — and the
  GS-rough-gradient pass pours fescue into every world's edge band + the whole ocean band. Derive the body
  + tuft colours from the world's own rough Shade (`turfShade('rough', arch)`), a touch deeper than the
  surrounding rough. And `DEEP_ROUGH` had no void/cetus row, so their calm-stop `deeprough` blobs fell
  through to the verdant-green default — add an indigo cosmic-tangle (void) + sea-blue kelp (cetus) row.
- **Chip cone matches the shot (`shotSpread`, preview-only).** The cone's near/far arcs were drawn at
  `[low+along, high+along]` (the carry window SHIFTED by the wind term), but `resolveShot` clamps the
  actual landing to the UN-shifted `[intended·lowFrac, intended·highFrac]` (wind only shifts the mean
  INSIDE it). Harmless at full power (window ≫ wind), catastrophic at chip power (window tiny, wind
  dominates) — a headwind chip drew a ~2–4y cone for a shot that clamps to ~8y while the aim line pointed
  elsewhere. Draw the arcs at the true window `[low, high]`; only `expectedCarry` carries the wind bias,
  inside the cone (verified across GW/60/64/SW at power 0.1..1). Also lowered the new-shot at-rest power
  seed floor 0.25 → 0.1 so a short greenside chip defaults its preview to the pin.

**Deferred (its own PR):** rough being too FORGIVING — a clean miss is only −10% carry and the heavy lies
sit off the centreline, so you can bomb over everything and club choice never bites. That's the balance
half of GS-rough-gradient (see `IDEAS.md GS-rough-gradient-rebalance`), gated by the death-spiral harness.

## GS-biome-relief: rolling-terrain DEPTH on every world (2026-07-08)

- **The ask.** Player: "can we add depth to all biomes? it needs to be biome specific and including
  Cetus/void/Asgard/rainbow road — they look good, but they all look incredibly flat and lifeless."
  Prior passes (GS-rough-frame → GS-ground-cover → GS-rough-cover-2) gave the rough its ground COLOUR
  and a surface TEXTURE (mottle/grain/tufts), but no large-scale FORM — so a whole world still pressed
  flat under its texture. The missing cue is directional terrain relief.
- **The fix (`style/relief.ts`, `biomeRelief` + `BIOME_RELIEF`).** Over the covering, lay soft PAIRED
  highlight/shadow lobes across the land, both lit from the shared upper-left sun (`LIGHT_UL`): a lit
  crest offset UP-light, a shaded hollow offset DOWN-light. The pairing is the whole trick — a lone
  bright tonal blob reads as a "spotlight" pasted on the hole (the documented failure mode of the old
  big section-4 tone patches, which is exactly why those were dialled down to near-invisible 0.03/0.07
  alpha); a highlight MARRIED to an offset shadow reads as a rise with volume. Mounds sit on a jittered
  COURSE-space grid (~3–4 per axis, radius overlapping for smooth undulation), clipped to the land.
- **Per-world, never neutral (`BIOME_RELIEF`, one row per archetype, machine-checked like the other
  biome tables).** Crest/hollow tints are keyed to each world's ground so the relief SELLS the biome:
  warm dune light + brown shadow (desert/ocean), snow-white crest + cool-blue hollow (frost), ember rise
  + charred hollow (inferno), luminous indigo rise + abyssal hollow (void), aqua clifftop swells (cetus),
  gilded meadow-rolls (asgard). Neutral white/black highlights are banned — they'd read as spotlights or
  smudges, not terrain. Rainbow Road takes its own `RAINBOW_RELIEF`, drawn ON the ribbon (its bands are
  opaque) as a gentle prismatic sheen so the track rolls without muddying the spectrum.
- **Determinism + camera (why it's cheap to trust).** The pass is PURE geometry — it draws ZERO rng, so
  it perturbs NO existing seeded stream (contract 1) and every prior seeded/byte test stays identical; it
  only ADDS prims. Per-mound variety is `posHash` of the COURSE-space cell, never rng, never the
  projection. The mound COUNT is a function of the land's course-space bbox (yards) and a course-space
  inside-poly test — camera-independent — and every mound is pushed UNCONDITIONALLY, so a follow-cam
  pan/zoom never shifts the prim count (`tests/camera-stability.test.ts` still green). Drawn UNDER the
  mown turf + cover + decor (section 3c), so the undulation lives in the rough where the flat read was
  worst and the crisp fairway/green/stripes paint over it. Rides `art.texture` (0 turns it off) — no new
  `window._gs*` hook, so no test-hub sync obligation. Re-shoot `scripts/gallery.mjs` after touching it.

## GS-hazard-edges: crossing rivers/lava/crevices read as banks, not band-aids (2026-07-09)

- **The ask.** Player: "the rivers and lava flows and large crack/crevice hazards that cut across the
  fairway or form a long thin length look more like a band-aid than an actual hazard — the sides
  would be more curved, jagged or rough depending on the hazard." The sim's crossing bands
  (`crossingBand`/`riverChannel`, and the barranca) have near-parallel, near-straight long sides — a
  provably-fair forced-carry geometry — so drawn verbatim they read as a uniform-width sticking
  plaster laid across the hole, not a hazard whose banks bulge, pinch and break up.
- **The fix (`style/hazards.ts` `roughenHazardEdge` + `roughenHazardCached`).** Roughen the DRAWN
  outline of each liquid/crevice body in COURSE space before projecting: densify the perimeter, then
  displace each sample along its outward normal by a `posHash`-derived field. Three characters
  (`ROUGH_SPECS`): WATER meanders in smooth low-frequency curves (`jag` 0.15), LAVA breaks into a
  jagged cracked crust (0.5), a CREVICE/ravine cracks hardest in sharp teeth (0.66). The smooth base
  is bilinear-interpolated value noise (`smoothNoise`) so a bank curves continuously; the jagged
  component is raw per-sample `posHash` confetti. Wired at the three draw sites in `style.ts`
  (`merged.water`→'water', `merged.lava`→'lava', barranca→'crevice').
- **Why it doesn't touch the physics (the whole point).** RENDER-ONLY: the sim's penalty polygon is
  untouched, so fairness-by-construction (`validateCrossings`/`validateFairness`), carry reads and
  the aim-cone all still run off the SMOOTH sim geometry. The displacement is MEAN-ZERO about the
  true edge (banks bulge out and pinch in equally) and amplitude-capped to a few yards — the same
  order as the shore/margin the liquid family already paints OUTSIDE the sim poly — so the drawn edge
  still tracks the penalty boundary (the graphic stays the physics). Amplitude is additionally
  clamped to ≤40% of the body's narrow dimension so a thin creek can never pinch shut, and bodies
  under 5 yd narrow are left alone (wobble would swamp them).
- **Determinism + camera + cost.** PURE geometry keyed off `posHash` of COURSE-space positions —
  ZERO rng draws, so it perturbs NO seeded scene stream (contract 1) and every byte/seeded test stays
  identical; it only reshapes existing bodies (the liquid family's flow/glint rng draw COUNT is
  independent of vertex count, so the stream is byte-stable). Course-space in → deterministic out →
  projected fresh each frame, so it's camera-proof (`tests/camera-stability.test.ts` still green).
  Cached per input poly (`roughCache` WeakMap; merged bodies + barranca polys are stable per hole) so
  the per-frame follow-cam rebuild pays the roughening once, not 60×/sec. No new `window._gs*` hook.

## GS-toxic-pools: the Toxic Mire's water is a glowing acid pool, not blue water (2026-07-10)

- **The ask.** Player: make the Toxic Mire biome "really stand out and be unique" — its hazards
  should be "properly vibrant glowing toxic pools in a superb neon green/teal hyper acidic
  colouration", and those toxic pools should REPLACE the water hazards on this biome. The world was
  already themed sickly-green everywhere it counts (miasma ambient/weather, dead bog-cypress flora,
  chartreuse muck turf), but its penalty water still drew in the shared blue `WATER_LIQ` palette — a
  blue lake in an acid bog read as a bug, and nothing about the hazards said "acid".
- **The fix (`style/hazards.ts` `TOXIC_LIQ` + `waterLiqFor`).** A new `LiquidPalette`, `TOXIC_LIQ`, a
  hyper-acidic neon ramp: a caustic acid-lime shore (`#c6f542`), a neon-green body (`#26e06e`)
  deepening through green-teal to a STILL-LUMINOUS teal core (`#0aa7a0` — never a muddy dark centre,
  so it reads chemical, not swamp water), bright acid current streaks + caustic glints, and — new to
  the liquid family — an EMISSIVE `glow` field: a neon halo (`rgba(96,255,150,0.30)`) pushed UNDER
  every pool body so it only shows in the ring beyond the shore, bleeding onto the bog like a pool
  lit from within. `waterLiqFor(arch)` routes the swamp archetype to `TOXIC_LIQ` and every other
  world to the classic `WATER_LIQ`; it's threaded at the single water draw site in `style.ts`
  (`styleLiquidFamily(waterPolys, waterLiqFor(arch), …)`). Lava stays per-KIND (`LAVA_LIQ`), never
  routed through here. The touchdown FX matches: `playView.spawnLandFX` throws a NEON-GREEN caustic
  splash on the swamp world instead of the blue one (`archetypeFor(themeId, biome) === 'swamp'`).
- **Why it's a pure reskin (the whole point).** RENDER-ONLY — the sim still plays these bodies as
  ordinary `water` penalty, so fairness-by-construction (`validateFairness`/`validateCrossings`),
  carry reads and the aim-cone are all untouched; "replacing water with toxic pools" is a palette
  swap behind the frozen course contract, not a new hazard kind. The `glow` prim is FIXED per body
  (centroid + mean radius, zero rng), so `styleLiquidFamily` consumes the exact same flow/glint rng
  draws as before — every non-swamp world is byte-identical, and the swamp's seeded scene stream is
  unchanged too (only the tones + the added halo differ). Verified: a toxic-mire hole carries the
  neon/lime/teal tones + the halo and NOT the old blue `#3f8fe0`; a verdant hole is unchanged; all
  1105 tests green. A new luminous liquid = a `LiquidPalette` with a `glow` + a `waterLiqFor` row.

## GS-rusted-bunkers: the Scrap Belt fits its rust — rust pits, steel plates, muted verdigris (2026-07-10)

- **The ask.** Player, on the Scrap Belt (metal) world: the verdigris fairway is "a vibrant green
  colour" that doesn't fit the rusted landscape, and its bunkers are pale beach SAND that "don't fit"
  a machine graveyard. Make the fairway blend, make the bunkers RUSTED, and mix "a bit more grey
  steel scrap" into the rust background/rough for a second colour that breaks up the monotone.
- **Three coordinated reskins, all render-only, all zero-rng.**
  1. **Muted verdigris fairway (`palette.ts ARCHETYPE_TURF.metal`).** The old fairway `#3f9e7e` (a
     bright patina lime) → `#5a8578`, a greyed/darkened oxidised-copper teal; green/tee/collar toned
     to match (the green kept a touch fresher so the target still reads). Teal-over-rust is
     complementary hues, so it stays readable while reading as weathered patina, not mown parkland.
  2. **Rusted bunkers (`style/hazards.ts` `SandPalette` + `sandLookFor`, the sand twin of
     `waterLiqFor`).** `styleSandFamily` now takes `arch` and selects a `SandPalette`; metal gets
     `RUST_SAND` — a flaky orange-rust body (`#a5623a`, brighter/oranger than the dark iron rough so
     it still reads as a pit), a rust-lit floor glow, dark corroded rake grooves (never the pale sand
     rake) and a deep iron lip. Every other world keeps `SAND` (`SAND_LOOK`). `spawnLandFX` throws a
     rust-flake puff on metal (same `archetypeFor === 'metal'` guard the toxic splash uses).
  3. **Grey steel as the third colour.** The Scrap Belt's firm `waste` SCATTER flats were the
     surprise — they draw from `hole.features` via `styleScatter`/`fillFor('waste')` (pale tan
     `#c2b280`), a SEPARATE path from the sand family, so they stayed sandy after the bunker swap. A
     `scatterLook` metal-`waste` case reskins them to brushed grey-STEEL plates (`#8b9099` + a lit
     seam) — riveted hull plate laid on the rust, and the most prominent home for the requested grey.
     The rough/background carry it too: `GROUND_COVER.metal` gains a `steel` mottle tone (a fraction
     of patches, posHash-picked), a bare-steel grain fleck, and a bare-steel shard tuft; `styleFlora`
     metal paints a fraction of its strewn hull-plates and drifting vacuum debris as grey steel (cold
     glint, no rust halo). All picked by course-space `posHash` — zero rng, camera-proof.
- **Why it's safe.** RENDER-ONLY — the sim still plays bunkers/waste as their ordinary lies, so
  escape difficulty, fairness and carry are untouched. Nothing adds or reorders an rng draw: the
  bunker/scatter changes are pure colour swaps on existing draws, and every steel accent is
  `posHash`-keyed (deterministic geometry, not rng). Every non-metal world is byte-identical.
  Verified on the scrap gallery: pale-tan `#c2b280` gone (0 px), grey steel present, rust bunkers +
  muted-teal fairway; all 1105 tests green. A new world bunker skin = a `SandPalette` + a
  `sandLookFor` row.
