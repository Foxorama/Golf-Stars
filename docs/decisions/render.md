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
  Pure, zero rng. Three exports:
  - `unionPolys(polys)` — true union; bbox-cluster union-find first, so ISOLATED bodies return their
    exact original vertices (identity fast path) and only genuinely touching clusters rasterise.
  - `unionClose(polys, gap)` — NEAR-body blend (GS-hazard-merge): fuses bodies within ~`gap` yards of
    one another (not just touching ones, the way `unionPolys` does) by dropping a slim NECK quad between
    each near pair, then taking the true grid union of bodies + necks. So a cluster of bunkers or a
    lake-and-pond pair reads as ONE organic complex with a natural pinched waist, instead of a scatter
    of individual stickers each wearing its own rim. Bodies keep their EXACT size — only a connecting
    waist is added — so the drawn hazard still tracks its sim penalty polys (graphic ≈ physics). A body
    with no neighbour within `gap` takes the identity fast path (a lone bunker is untouched). Neck width
    scales to the smaller body (pots → an isthmus, lakes → a fat waist).
  - `dilateUnion(polys, pad)` — union of the polys grown by `pad`, rounded corners, can never fold.
- **Sand + liquid families draw MERGED bodies.** `mergedHazardsFor(hole)` (WeakMap-cached per hole)
  CLOSES each family's polys in COURSE space via `unionClose` (`HAZARD_MERGE_GAP` = sand 14 / water 11 /
  lava 11 yd — sand bridges a hair wider since bunkers cluster into fields; water/lava are larger bodies
  a player still reads as distinct at a wider gap); `styleSandFamily`/`styleLiquidFamily` receive the
  merged loops, so nearby bunkers/pots/waste read as ONE excavated complex with a single lip-shadow +
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

- **The waterfall TIPS to line up with the edge (GS-cetus-waterfall-angle, 2026-07-14).** The curtain
  (both the animated `cetusFlow` and the static `cetusRiver`) always dropped straight screen-DOWN — the
  cliff-extrusion convention. When the river arrives at the lip vertically that's perfect (and it's the
  case players loved). But the follow-cam ROTATES: on a hole where the river reaches the plateau edge on
  a slant, the fixed straight-down fall painted a flat HORIZONTAL lip pasted across a diagonal river,
  reading as "not lining up with the edge" — the exact complaint. FIX: a shared `waterfallBasis(screen)`
  (in `style/platforms.ts`) reads the river's PROJECTED downstream tangent at the spill (a few points
  upstream → the spill) and returns a fall unit vector + a perpendicular lip vector. The bands, lip,
  falling streaks and splash are all rebuilt off that basis (`fpt(u, lat, half)`), so the lip lies ALONG
  the edge and the curtain continues the river's flow off it. The tilt is CLAMPED to ≤~34° off
  straight-down (via `atan2(dx,dy)` deviation) so it never falls sideways or up — always a gravity drop;
  and when the tangent already points straight down the basis returns `(fx,fy)=(0,1),(px,py)=(1,0)`,
  which reduces every offset to the OLD straight-down math BYTE-FOR-BYTE (the aligned case is untouched).
  The `paint` gate (don't draw a fall that lands on turf) probes along the tilted fall direction too, so
  it stays correct under rotation. Pure screen-space geometry off the projected spine — ZERO rng, no
  seeded stream touched, `cetus.test`'s byte-stability + gating assertions unchanged. ONE basis feeds
  both the map and the play view so they can't diverge. Eyeball with `scripts/cetus-angle-preview.mjs`
  (auto-finds real waterfall holes at several arrival angles; the near-0° tile must match the old look).

## GS-overlay-decor: the animated world-decor also moves on the aim/putt screen (2026-07-10)

- **The moving decor twins were watch-only (the bug).** `render/cetusFlow.ts` (the flowing Cetus
  star-waterfall), `render/shipDrift.ts` (the derelict's drifting hull junk + the "Starlit Wanderer"
  sections) and the meteor STRIKES were all wired into the Canvas2D play view (`playView.ts`) — the
  animated WATCH. The DECISION/AIM and PUTT screens are the static SVG map (`holeView.ts`) with a
  screen-space WEATHER overlay canvas on top (`app/playFx.mountWeatherOverlay`). That overlay drew only
  sky + air (twinkling stars, wind, meteor STREAKS) but NOT the course-space decor, so on the screen the
  player stares at most, the "starry waterfall" and the "drifting ship debris" sat frozen (player
  report: "only animated in the watching mode"). Meteor craters had the same gap — a strike dove in only
  mid-flight (the overlay's local projector was wind-orientation only, so it "would lie about crater
  positions", per the old code comment).
- **Why it couldn't just draw them.** The decor is COURSE-space (a star must sit on the river channel,
  a strike on a drawn crater), but the overlay canvas fills the `.gs-bigmap` container while the SVG map
  is a fixed `viewBox` (360×640) CSS-scaled INTO that container by the default `preserveAspectRatio`
  (meet — uniform + centred, letterboxed). The overlay's old projector deliberately gave up on matching
  the map's fit (it only oriented the wind), so a course-projected mote would drift OFF the drawn river.
- **The fix: a letterbox-aligned projector.** `playFx.alignedProjector(hole, mapProj, cw, ch)` builds
  the map's OWN `holeProjector` at the viewBox size, then composes the meet-fit transform
  (`s = min(cw/vbW, ch/vbH)`, centred offset `ox/oy`) onto the canvas pixels — so `project` lands
  pixel-for-pixel on the SVG content beneath, and `unproject`/`scale` follow. `app.ts` arms it via a new
  `overlayDecor` module var set by the decision + putt branches to the SVG map's EXACT projector options
  — but ONLY in FOCUS/FOLLOW mode: the whole-hole fit folds `extra` points (playBounds, shots, the
  spray arc) into its projector that the overlay can't reproduce, so it stays static there (the SVG keeps
  its own static decor). `mountWeatherOverlay` then: (a) feeds `createWeather.strikeTargets` off the
  aligned projector so a meteor dives into a real crater on the aim/putt screen too; (b) draws
  `createCetusFlow` / `createShipDrift` each frame over the weather.
- **Z-order — the Cetus `overlayOnly` mode.** The overlay canvas sits ON TOP of the SVG (its ball
  marker + aim cone). The Cetus flow normally paints an opaque channel BED (`rgba(8,30,48,0.92)`) —
  which would blot the ball/cone out. So `cetusFlow.draw(…, overlayOnly=true)` SKIPS the bed block: the
  SVG's own static `cetusRiver` IS the bed underneath (kept, not suppressed), and we layer only the
  MOVING star-motes + waterfall over it. The play-view watch keeps `overlayOnly` false (full bed,
  static river suppressed via `animateCetus`) — unchanged. The ship drift needs no such mode: its junk
  floats in the space OFF the deck (chunks skip land; sections ride the side margins), never over the cone.
- **Putt suppression (the second report).** "the ship debris … shows when putting and it's then very
  small because of the zoom in and looks super weird." The putt view is a ~25-yd green zoom; the
  screen-space ship SECTIONS floated absurdly over the cup there. So `drift` is OFF on the putt overlay
  (`overlayDecor.drift = false`) AND on the putts-only green WATCH (a new `PlayViewOptions.ambientDrift`,
  set `hadShots` at the animation mount — a shot watch keeps the decor, a green putt drops it). Meteor
  strikes stay on the putt overlay (sky, fine zoomed in).
- **Determinism / purity.** All of this is the browser SIDE layer (`app/`, render overlays) — never the
  sim; no seeded stream is touched and no test exercises it, so the suite is byte-identical. No new hook:
  the flow/drift speeds reuse the existing `_gsFeel.cetusFlowSpeed` / `.shipDriftSpeed` sub-fields. Verified
  eyes-on with a letterbox-aligned harness (static SVG scene + overlay decor): the Cetus motes ride the
  static river with the ball marker clear, and the ship junk drifts off the deck; both animate frame-to-frame.

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

## GS-decor-view-states — animated decor that doesn't jump between the four gameplay views

**The report.** Animated graphical decor kept getting implemented so it "works differently in each
mode or works in some modes and not in others" — most visibly the derelict's drifting hull debris,
which had a **different scale and a different flight path** in each view and so **jumped around** when
a shot released and the camera cut from aiming to watching. Weather was the other loud offender.

**Why.** There are two entirely separate render paths, and each drew the decor independently:

- **Aim / chip / putt** — a static **SVG** map plus a transparent **overlay canvas** (`mountWeatherOverlay`,
  `app/playFx.ts`) that draws the decor through an `alignedProjector` (the SVG's 360×640 viewBox meet-fit
  into the canvas), a **static** camera, driven by **`performance.now()`** (wall clock).
- **Watch** — one **Canvas2D** `mountPlayView`, decor drawn through the base scene's **per-frame follow-cam**
  projector, driven by the **virtual clock `vnow`** that **starts at 0 each mount** and runs in slo-mo
  during caddy saves.

Every decor element is a function of `(projector, now)`; the two paths disagreed on **both**. Four
independent causes, all confirmed in code:

1. **Clock origin mismatch (dominant).** Aim fed a huge real-time value; the watch fed `vnow≈0`. Every
   drift/twinkle/meteor phase teleported at the cut. This alone popped weather, the river, and all debris.
2. **The big ship SECTIONS were pure screen-space** (`shipDrift.ts`): size `sizeFrac*min(W,H)`, position
   `fx*W, fy*H`, drift in screen px/s — not tied to the world at all, and canvas-size-dependent. Exactly
   the "different scale + different flight path" report.
3. **Course-anchored decor** (river, small junk chunks) reads `proj.scale`, which differs between the two
   projectors (letterboxed-viewBox fit vs direct-viewport fit) → a scale pop.
4. **Screen-space weather** is seeded to canvas `W×H`.

The two states that *didn't* glitch only avoided it by switching decor OFF (whole-hole aim → no aligned
decor; putt watch → `ambientDrift:false`) — a workaround, not a fix.

**The fix — make decor a pure function of `(worldPosition, wallClock)`.** Then the four views differ only
by projector, which *correctly* reframes world decor with the world, and nothing pops:

1. **One shared wall clock.** `playView.ts` draws weather + Cetus flow + ship drift + meteor strikes off
   the raw rAF timestamp (`realNow` = the same `performance.now()` origin the overlay uses), NOT `vnow`.
   `vnow` stays for the ball/caddy/shake cinematic only — and the ambient world rightly no longer slows to
   a crawl during a caddy slow-mo. Fixes cause #1 for every element.
2. **World-anchor the ship sections.** `shipDriftModel(hole)` now seeds each big hull section in COURSE
   space (a base off the deck, a yard/s drift, a course-YARD size), projected + `proj.scale`-sized each
   frame exactly like the small chunks and the static SVG debris twin. They zoom with the world (bigger in
   the tight follow-cam, smaller whole-hole) — the deliberate trade for consistency, chosen over the old
   fixed-screen-size "distant hull" look. Kills cause #2.
3. **Weather stays sky, but continuous.** It's genuinely a viewport-anchored sky layer (at infinity); the
   shared clock (cause #1) makes its animation phase continuous, and because the aim overlay canvas and the
   watch canvas are the SAME full-bleed `.gs-bigmap` size, its screen-space layout already matches (cause
   #4 is moot). No weather layout refactor needed.

**Tests (the report asked for browser coverage in CI too).**

- `tests/decor-consistency.test.ts` (node): `shipDriftModel` is deterministic and purely course-space —
  every element seeded in yards within the hole band, sections carry NO screen-space fields (`fx/fy/vx/vy/
  sizeFrac`), and `driftPos` is a pure, projector-free, band-wrapping function. This is the regression
  guard against any future screen-anchored decor.
- `tests/build.test.ts` (headless Chromium, runs in CI): `window.__gsDecorProbe` renders the derelict
  decor at one wall-clock through two projectors that differ ONLY by a camera PAN. World-anchored decor's
  centroid must move by exactly the pan (`centroidErr` ≈ 0); a screen-anchored element would hold the
  centroid still and blow the error out toward `|shift|`. Asserts `centroidErr < 2.5px` plus a secondary
  pan-realigned mask IoU floor. `__gsDecorProbe` is a double-underscore QA hook (like `__gsErr`), so the
  test-hub sync guard ignores it — it is not a player-facing `_gs*` feel flag.

**The rule for any new animated decor twin:** obey BOTH — course-anchor it if it represents a world
object, and drive it off the shared wall clock — or it will render differently in each view and jump.

---

## Migrated from CLAUDE.md — System-index bullets (2026-07-23 refactor)

> These are the verbatim terse System-index bullets moved out of `CLAUDE.md` when it was
> compressed back to a lean constitution. They are the tip-of-iceberg pointers that had grown
> into full implementation histories in the root file. The durable *rule* now lives as a short
> bullet in `CLAUDE.md`; the detail below (and the deeper narrative already in this doc) is the
> archive. Nothing here is lost — it is just no longer cluttering the constitution.

- **Render layer** — `docs/decisions/render.md`
  - ONE pure projector (`render/project.ts`) both renderers share. ONE shared scene builder
    (`render/style.ts buildScene` → `Prim[]`); SVG = static map, Canvas2D = animated play view.
  - `style.ts` is the ORCHESTRATOR only (GS-style-split): `buildScene` keeps the seeded streams +
    their draw ORDER, the two interpreters, and the unchanged public exports; the painters live in
    per-domain `src/render/style/*` modules (shared / land / fairway / green / hazards / flora /
    ground / platforms / effects). **A new painter = a new `style/` module**, and painter modules
    never import style.ts (`shared.ts` is the dependency root — no cycles).
  - All scene randomness is mulberry32 seeded from `hashHole()` on documented streams — adding a
    draw must not perturb existing stream order. SVG clip/gradient ids are per-hole
    (`holeIdPrefix`) — document-global ids cross-clip co-mounted SVGs.
  - The scene is CAMERA-PROOF (the follow-cam rebuilds per frame): rng draw counts never read the
    projection; `posHash` keys are course-space, never screen px; `archetypeDecor` pushes its prims
    UNCONDITIONALLY. `tests/camera-stability.test.ts` guards.
  - Rough is ROUGH; space starts at the OB frame: the land hull fills `playBounds`+apron with the
    world's rough palette; every archetype's `rough.base` sits ≥30/255 brightness above its space
    tone (machine-checked). The rough is the biome's ground COVERING (`GROUND_COVER` table — every
    archetype has a row EXCEPT void/cetus, machine-checked). Easter-egg props (`EGGS`) hide in the
    rough on their own stream, off-corridor, camera-proof; void/cetus excluded.
  - DEPTH: over the covering, `biomeRelief` (`style/relief.ts`, `BIOME_RELIEF` table — EVERY
    archetype has a row, machine-checked) lays directionally-lit relief mounds so the ground reads as
    ROLLING terrain, not a flat slab (GS-biome-relief). Paired hi/lo lobes offset along `LIGHT_UL`
    (a lit crest + an offset shaded hollow = a rise with volume; a lone bright blob is the "spotlight"
    bug); tints are per-world (dunes/snow drifts/scorched swells/cosmic rises/gilded rolls), never
    neutral. PURE geometry (ZERO rng — `posHash` variety only) → perturbs no seeded stream (contract
    1) and the mound count is a function of the COURSE-space land bbox, never the projection
    (camera-proof). Clipped to the land/lost-platforms and drawn UNDER the mown turf (undulation lives
    in the rough); Rainbow Road rides its own `RAINBOW_RELIEF` sheen ON the ribbon. Rides `art.texture`
    (no new `_gs*` hook). Re-shoot the gallery after touching it.
  - Platforms + hazard families merge through `render/merge.ts`: platforms are
    `dilateUnion(…, 14)` (never a mitred `offsetPoly` outset — it folds at concave bends);
    sand/liquid families draw NEAR-body-CLOSED bodies (`unionClose`, course-space, WeakMap-cached,
    GS-hazard-merge). Where `unionPolys` fuses only bodies that already TOUCH, `unionClose` also bridges
    hazards within a `gap` (`HAZARD_MERGE_GAP` = sand 14 / water 11 / lava 11 yd) by dropping a slim neck
    quad between each near pair — so a cluster of bunkers or a lake+pond reads as ONE organic complex with
    a pinched waist, not a manky pile of individual stickers. Bodies keep their exact size (only a neck is
    added → graphic ≈ physics); a lone hazard is untouched. Render-only, zero rng — sim penalty polys
    (fairness/carry/aim) are unchanged, so no balance impact.
  - A lost-rough platform's side-on CLIFF (`platformCliffs`, cetus/void/rainbow) extrudes from the
    platform's REAL lower silhouette (`frontEdge(plat)`), NOT its convex hull (GS-void-cetus-cliffs): the
    hull chorded across concave bays + the flanks of a narrow vertical island, so the supporting wall
    showed only along the bottom bulge ("pillars only visible in some places") — the real edge wraps the
    whole lower perimeter so the landmass reads walled all round. Height keys off `min(w,h)` (floor 44) so
    a tall skinny island still gets a substantial wall. `CETUS_CLIFF`/`VOID_CLIFF` strata are SATURATED
    (teal→blue→deep-blue→black / violet→black), not the old greyed ramp that washed out against the deep;
    the animated `cetusFlow.fallLenFor` MIRRORS the cliff-height formula so the moving waterfall reaches
    the same foot. Pure geometry, zero rng, camera-proof; the lit `lipA` is unchanged (guarded by
    `tests/cetus.test.ts`).
  - A crossing river/lava flow/crevice's DRAWN bank is roughened so it reads as a natural hazard,
    not a uniform band-aid (GS-hazard-edges, `roughenHazardEdge`): course-space, `posHash`-derived,
    MEAN-ZERO about the true edge + amplitude-capped (≤40% of the body's narrow span) → RENDER-ONLY,
    the sim penalty poly (fairness/carry/aim-cone) is untouched and the graphic still tracks physics.
    WATER meanders in smooth curves, LAVA cracks into jagged crust, a CREVICE cracks hardest.
    ZERO rng (byte-stable streams), camera-proof, WeakMap-cached per body.
  - The water LIQUID palette is per-WORLD via `waterLiqFor(arch)` (GS-toxic-pools): the Toxic Mire
    (swamp) draws GLOWING neon-green/teal ACID pools (`TOXIC_LIQ` — caustic acid-lime shore, neon body,
    luminous teal core, + an emissive `glow` halo the liquid family paints UNDER each body), every
    other world keeps the classic blue `WATER_LIQ`; lava stays per-KIND (`LAVA_LIQ`). RENDER-ONLY —
    the sim still plays these as ordinary `water` penalty (fairness/carry untouched), and the `glow`
    prim is fixed/zero-rng so `styleLiquidFamily` draws the same flow/glint stream (feature-off worlds
    byte-identical). `spawnLandFX` throws a matching neon acid splash on swamp. A new luminous liquid =
    a `LiquidPalette` with `glow` + a `waterLiqFor` row.
  - The BUNKER palette is per-WORLD via `sandLookFor(arch)` (GS-rusted-bunkers), the sand twin of
    `waterLiqFor`: the Scrap Belt (metal) digs flaky orange-RUST pits (`RUST_SAND` — no pale beach
    tan, dark corroded rake grooves) so the hazard fits the corroded machine graveyard; every other
    world keeps ordinary `SAND`. Its firm `waste` SCATTER flats reskin to brushed grey-STEEL plates
    (a `scatterLook` metal-waste case), and the rough/background carry grey steel too (`GROUND_COVER.
    metal.steel` mottle patches + a steel grain fleck + a bare-steel shard, and grey plates/debris in
    `styleFlora` metal) so the rust reads broken up by a cool third colour beside the MUTED-verdigris
    fairway (`ARCHETYPE_TURF.metal` — a greyed patina teal, not a vibrant lime). ALL render-only, zero
    rng (colour swaps + posHash-picked steel), so the sim plays these as ordinary sand/waste lies and
    every non-metal world is byte-identical. `spawnLandFX` throws a rust-flake puff on metal. A new
    world bunker skin = a `SandPalette` + a `sandLookFor` row.
  - Carved features share ONE light (`LIGHT_UL` → `insetEmboss`/`embossChildren`). NO drop shadow
    onto turf (reads as floating); the depression is a THIN lip capped by body radius; the green is
    FLUSH with the fairway. Its OUTWARD fringe/collar apron rings (`styleGreenSurround`) draw UNDER
    the fairway pass, so they ease the green into the ROUGH and never paint over the corridor (the
    apron-over-fairway bug). Where the flared APRON fairway now wraps the green (GS-green-flare), that
    rough-side surround is covered — so a second mown COLLAR ring (GS-green-blend, in the feature loop,
    grounded worlds only) draws ON TOP of the fairway, two outward rings blended green↔fairway turf and
    always LIGHTER-toward-fairway (never the dark ring GS-green-apron banished), melting the green→apron
    junction (fairway → collar → fringe → green). The green's own perimeter ink softened to 0.5/1.1 so it
    reads as a mown edge, not a hard outline. Void/cetus (glow rim / shelf) + rainbow (ribbon) keep their
    own edge and stay byte-for-byte (the derelict is excluded too — its deck gets its own blend,
    GS-ship-deck-blend); pure geometry, zero rng. `deeprough`/`fescue` blobs are per-ARCHETYPE (`DEEP_ROUGH` has a row for
    every world incl. void/cetus; fescue derives its body/tufts from `turfShade('rough', arch)`) — the
    GS-rough-gradient pass pours them onto every world, so neither may hardcode one world's palette.
    Hazards get a soft grassy margin blended toward the hazard (never
    darker than turf); internals deepen through smooth feathered ramps, not hard bands. The fairway
    takes a first-cut `collar` + a FEATHERED cut grade + edge-ease strokes + two-band sheen on
    parkland worlds only (void/cetus pass NO collar; edge bands are clipped STROKES, never deep
    `offsetPoly` insets — those fold on a thin ribbon). All pure geometry, zero rng
    (GS-fairway-2).
  - Turf bases still emit `#3f8c3f`/`#5fd45a` (the holeView fill test).
  - The aim-cone overlay is SCALE-HONEST: every layout decision reads the projector's px-per-yard;
    blocked-zone shading probes the sim's OWN flight walks — never fork them, never hard-code px
    into the sim. A line is shaded BINARY (clear, or blocked from the object to the cone's far
    edge). The blocked-zone glyph is keyed to the WORLD archetype (`TREE_GLYPH` mirrors
    `styleFlora`); tents stay ⛺. The cone's near/far ARCS are `shotSpread`'s `[low, high]` = exactly
    `resolveShot`'s UN-shifted carry clamp; wind rides ONLY `expectedCarry` (the aim line), INSIDE the
    cone — never add the wind term to the arcs (it draws a window the shot can't reach; invisible at
    full power, wildly wrong at chip power — the "arc too long/short around the green" bug).
  - The pull-to-power gesture redraws ONLY the spray-cone group (`#gs-shot-overlay` via
    `renderShotOverlaySVG` / `shotConeParts`) + the power/legend HUD spans in place, NEVER a full
    `render()` per drag frame — a full render rebuilds the whole `buildScene` (flora, rough gradient,
    contour art) and lagged hard on close chips/putts. Focus/follow mode only (stable projector);
    whole-hole fit mode falls back to `scheduleRender`. The sibling of the #281 putt-overlay swap.
  - The PUTTS-ONLY watch-cam holds a STATIC frame (`follow: hadShots` in the animation mount — off for
    a green putt), centred on the ball↔cup midpoint at `puttViewRadius` exactly like the putt aim
    screen. The follow-cam rebuilds the projector every frame, which defeats playView's `cachedProj`
    scene cache and re-ran the whole heavy `buildScene` 60×/sec — the putt-watch chug (worst on
    frost/ice greens). A putt's whole span is already framed, so no follow is needed and the scene
    builds ONCE (verified 19→1 on a short putt; larger on a long one). Shots still follow the ball in
    flight. (GS-putt-watch-lag.)
  - Per-world identity is table+dispatch, never a fork: flora, OB markers, signature decor, ambient
    air, wind tint are ALL archetype-keyed (`tests/biome-identity.test.ts` guards full coverage); a
    flora variant must consume EXACTLY the classic two rng draws (extra variation via `posHash`).
  - The weather layer's pinned starfield masks off `landPolysCourseFor`; meteor strikes re-burn
    EXISTING scorch marks fed by the play view's LIVE projector (never the aim overlay's).
  - The Cetus star-waterfall MOVES in the Canvas2D play view (GS-cetus-flow, `render/cetusFlow.ts`):
    the play view sets `SceneOpts.animateCetus` to suppress the static `cetusRiver` and instead draws
    a live flow over the scene — stars drift source→spill, curtain streaks fall, the splash churns —
    on the SAME course-space channel `cetusRiverPath` emits. Motion rides the SHARED WALL clock
    (GS-decor-view-states), ZERO rng, so `animateCetus`-off (SVG map + tests) is byte-identical;
    PERF-neutral (geometry cached at mount, per-frame = re-project a short polyline + ~90 capped particles,
    NO `buildScene` rebuild — it replaces the equal static river the follow-cam rebuilt). Speed rides
    `_gsFeel.cetusFlowSpeed`. The WATERFALL tips to the EDGE (GS-cetus-waterfall-angle,
    `waterfallBasis` in `style/platforms.ts`, shared by BOTH the animated flow AND the static
    `cetusRiver`): the curtain used to always drop straight screen-DOWN, so a rotated follow-cam sat a
    flat horizontal lip across a river arriving on a slant. Now the lip + curtain lean along the river's
    own PROJECTED downstream tangent at the spill, so they line up with the plateau edge — clamped to
    ≤~34° off straight-down (never sideways/up, always reads as a gravity drop) and byte-for-byte
    straight-down when the river arrives vertically (the perfectly-aligned case). Pure geometry, zero rng.
  - DECOR IS VIEW-STATE-INVARIANT (GS-decor-view-states): the four gameplay views (aim / watch / chip /
    putt) draw the animated decor through DIFFERENT projectors on DIFFERENT canvases, so any element that
    is a pure function of `(worldPosition, wallClock)` reads IDENTICALLY in all four and never jumps on a
    view switch — the projector just reframes it WITH the world. Two rules make that hold: (a) world decor
    (Cetus river, ship junk + hull sections, meteor craters) is COURSE-anchored — projected + `proj.scale`-
    sized each frame, NEVER screen-fraction anchored (`fx*W`, `sizeFrac*min(W,H)`); (b) ALL ambient decor
    rides the SHARED WALL clock (`performance.now()` / the raw rAF timestamp — `playFx.ts`'s overlay AND
    `playView.ts`'s watch), NOT the slo-mo virtual `vnow` (which stays for the ball/caddy/shake cinematic
    only) — a per-mount clock that reset to 0 made the whole sky/river/junk teleport at the aim→watch cut.
    Weather is screen-space SKY (viewport-anchored, at infinity) but continuous via the shared clock + the
    two play canvases being the SAME full-bleed size. GUARDED: `tests/decor-consistency.test.ts` proves the
    ship-drift MODEL is course-space + holds no screen-space fields; `tests/build.test.ts`'s headless-
    Chromium `window.__gsDecorProbe` pans the camera and asserts the decor centroid moves WITH the world
    (world-anchored), not against it. A new animated decor twin obeys BOTH rules or it will jump.
  - AIM-OVERLAY DECOR (GS-overlay-decor): the animated world-decor twins (Cetus flow, derelict ship
    drift) AND meteor STRIKES used to move only while WATCHING a shot — on the static aim/putt screen
    the river/junk/craters sat frozen. `mountWeatherOverlay` (`app/playFx.ts`) now draws them over the
    aim/putt map too, through a `alignedProjector` that composes the SVG map's OWN projector with the
    CSS meet-fit letterbox transform, so the decor lines up pixel-for-pixel with the map beneath. Only
    in FOCUS/FOLLOW mode (armed via `overlayDecor` in `app.ts`); whole-hole fit folds `extra` points the
    overlay can't reproduce, so it stays static there. The Cetus river draws in `overlayOnly` mode (skips
    the opaque channel BED — the SVG's static river IS the bed, so the ball marker + aim cone stay
    readable under only the moving motes/waterfall). `drift` is OFF on the putt screen + the putts-only
    green watch (`ambientDrift`): the tight ~25-yd zoom floated the ship SECTIONS weirdly over the cup.
    Browser-only side layer (never the sim); no new hook (reuses `_gsFeel.cetus/shipDriftSpeed`).
  - The decision map's framing holds still for the whole shot decision; the shot animation starts
    at the decision map's exact `decisionRadius`. `playView`'s `spawnLandFX` answers the touchdown
    per lie/penalty — extend it with any new penalty kind.
  - Re-shoot the gallery (`node scripts/gallery.mjs`) after any `style.ts` / `style/*` change.
  - Shop/reward CLUB cards draw a per-FAMILY head (GS-club-icons, `render/itemArt.ts`): `clubFamilyOf`
    → `clubHead` (driver/wood/hybrid/iron/wedge/putter), shaft + head share ONE `HOSEL` anchor so the
    shaft meets the HEEL (centre = the old shovel look). Gear-shaft items resolve via `SHAFT_FAMILY`,
    reward clubs off their `<type>`; `itemArtKind` stays `'shaft'` (per-id emblems keep them distinct).
    Pure SVG, no rng/save bump. Eyeball with `scripts/club-icons-preview.mjs`.

---

## GS-green-complex — the green complex reads as one mown surface at every camera (2026-07-26)

**The ask** (playtest): "the fairway, green*s* and green aprons still aren't blending properly, they look
like art assets stacked on top of each other instead of one smooth hole, and most of the green areas still
look very similar."

Both halves of that turned out to have ONE root cause each, and both were sitting in plain sight.

### 1. Every turf blend was measured in PIXELS

`styleGreenSurround`, `styleFairways`' first cut, `styleTee`'s fringe, the on-fairway green collar, the
fairway's edge-ease strokes and crown sheen — all of them offset the PROJECTED polygon by a hard-coded
pixel count (`offsetPoly(sp, -6)`, `sw: 9`, `shiftPoly(…, 3)`).

The whole-hole map runs at roughly **1 px/yard**, so 6px read as a plausible ~6-yard apron and everything
looked fine in the gallery — which is the zoom every previous blending pass (GS-green-apron, GS-fairway-2,
GS-green-blend) was eyeballed at. The chip/putt camera runs at **~6.6 px/yard**. The same 6px is
**under a yard of ground** there — so at the exact camera where the player leans in and studies the
turf, every mown transition on the hole collapsed to a hairline and the green butted the fairway on a
hard cut. Five separate blending passes had all been tuned blind to it.

**The rule now:** `shared.ts turfPx(scale, yards)` — a blend band is a width of GROUND, floored (2px, so
it never vanishes on a whole-hole map) and capped (64px, so a deep zoom can't flood the frame). Sizes may
read the projection; only COUNTS may not (the camera contract), and no count changed. Yard values were
picked to reproduce what the old pixel values read as at map zoom, so the gallery is essentially
unchanged and the near cameras gain the apron they never had.

The staircase went too: `turfRamp` walks the fringe→collar transition in six even steps, small enough
that no single tone jump reads as a ring (two or three opaque rings always read as concentric stickers,
however carefully the tones are chosen — the eye finds the step).

And the on-fairway collar became a **tint**, not a fill (`turfRampTint`, peak α 0.24). Opaque rings wiped
the corridor's mowing stripes, sheen and texture in a band around the green and re-read as *paint* — the
very "stacked art asset" tell the collar was added to cure. Tinted, the fairway's own groundskeeping shows
straight through and the collar reads as the corridor MOWN DOWN into the green.

### 2. The green was dressed identically on every world

However distinct the generator made a green's SHAPE (`greenSize`/`greenAspect`/`greenIrregular` per biome
profile), the RENDER dressed all of them the same: one fixed two-ring apron, and `stripes(poly, …, 6)` —
**always horizontal, on every world**, while the fairway had had per-world mowing grain since GS-variety-2.
A frost corridor swept vertically met a horizontally-striped green at a hard seam; a cross-mown jungle
corridor met the same horizontal green. Two materials butted together, on every world, at every hole.

So the pattern dispatch moved out of `style/fairway.ts` into `shared.ts` as `mowPattern`, and the green
now mows in **its own world's grain, phased off the corridor's band grid** — one greenkeeper, one hole.
Per-world presentation is a ROW (`GREEN_COMPLEX` in `style/green.ts`): `apronYd` (a links/desert green
runs out into a broad tight-mown apron, the jungle and mire crowd right up to the surface), `collarYd`,
`mowBands`. A new world is a row; machine-checked for full archetype coverage.

`fairwayBandH` was split out so the corridor's own pitch is one named thing the green can subdivide —
and it returns each world's classic pitch verbatim, so **the fairway mow is byte-for-byte unchanged**.

### The lesson worth carrying: a blend must not dissolve the thing it blends

The first preview of this change was a straight failure. With the collar at apron width and α 0.5, every
world's putting surface melted into its corridor — beautiful, seamless, and **unreadable**. That is not a
polish miss, it is a *fairness* bug: the golf-soul rule is that an absurd course still has to be readable,
and if you can't see where the green ends you can't judge a chip. The fix is asymmetric by design — a WIDE
apron and a deliberately NARROW collar, plus the surface keeping its own base fill and an inward edge ease
that re-states the shape. `tests/green-complex.test.ts` pins `collarYd < apronYd`, the tint alpha ceiling,
and that `styleGreen` always lays its own base fill.

**Verification:** full suite green (1903 tests), `npx tsc --noEmit` clean, gallery re-shot across all
worlds, plus `scripts/greenblend-preview.mjs` (approach zoom) and `scripts/green-zoom.mjs` (putt zoom)
eyeballed before/after — the before/after at putt zoom is where the whole change is visible.

## GS-play-fullframe — the play map is drawn at the SCREEN'S shape, not a fixed 9:16 frame (2026-07-26)

**The report:** "the putt-make window still gets black borders."

**The cause, measured.** The decision/putt map SVG was authored at a hard-coded `360×640` viewBox
(`DMAP_W`/`DMAP_H`) and handed to CSS as `width:100%; height:100%` inside a `.gs-bigmap` that is
`position:absolute; inset:0` — i.e. the whole viewport. With no `preserveAspectRatio` attribute the
browser applies the default **meet** fit: scale uniformly to FIT, then CENTRE. Any aspect mismatch
therefore became dead bands of bare page background (`--gs-bg: #0b0d12`) at the ends of the longer
axis. Probed on a 390×844 phone: `getScreenCTM()` returned `scale 1.0833, offY 75.33` — a 390×693
map centred in an 844px box, **75px of black above and 75px below, 18% of the screen**. On a 412×915
Pixel it is 91px each.

Why it read as a *putt/whole-map* bug rather than an everywhere bug: the outer `<svg>` clips to its
ELEMENT box, not its viewBox, so course-space geometry that happens to project past the frame paints
straight into the bands and hides them. A hit-test (`elementsFromPoint` across each band) showed the
aim view's bands full of spilled starfield decor, and the **whole-hole view's bottom band returning
`NONE` at every probe point** — nothing drawn, pure page background. That is the black bar.

**The fix: fit the FRAME to the container, don't fit the container to the frame.**
`project.ts fitFrame(cw, ch, dw, dh)` keeps the meet SCALE the browser would have chosen
(`s = min(cw/dw, ch/dh)`) and returns the design frame GROWN to `cw/s × ch/s`. The SVG's aspect then
equals the container's, meet becomes the identity, and the reclaimed bands are simply more map.

Three properties make this the right shape of fix, and all three are pinned by `tests/map-frame.test.ts`:
- **Nothing changes size.** Every stroke width, font size and marker radius in `buildScene` is a number
  of design units; keeping the meet scale means they all land at exactly the pixel size they had. A
  stretch would distort them and a `slice` fit would have cropped the ball clean off a landscape screen.
- **Nothing moves.** Focus mode is width-limited on a portrait frame (`scale = min((W-2p)/2R, …)`), and
  the width is untouched — so the corridor frames identically and `focusBias` still lands the ball at
  the same fraction of the screen. The extra height is purely more hole, ahead and behind.
- **The 9:16 reference is byte-for-byte.** A container already at the design aspect returns `360×640`
  unchanged, so the frame only ever grows on the starved axis.

**Threading it.** `mapFrame()` in `app.ts` caches the fit against the measured container key, and the
aim map, the putt map, both surgical overlay refreshers (`renderShotOverlaySVG` / `renderPuttOverlaySVG`),
`overlayDecor.mapProj` and the weather overlay's `dims` all read the SAME value — a re-measure per call
could straddle a resize and shear the cone off the scene. `playFx.alignedProjector` needed no change: its
meet-fit composition is now the identity but stays correct for whatever frame it is handed.

**Keeping it honest when the container moves.** `mapFrame()` measures the PREVIOUS render's element (or
the window on first arrival), so after mounting, render() compares the real element against the key the
frame was built for and re-renders once on a mismatch; a `resize` listener does the same for a rotate or
a desktop window drag. Both are armed only while the SVG map is what's mounted — a shot animation puts a
CANVAS there, already sized to real pixels, and a remount mid-flight would restart the shot. Verified
non-looping: a `MutationObserver` on the play screen counted **0 re-renders idle over 2s**.

**Verification:** headless-Chromium drive of the real app at 390×844 through aim → whole-hole → watch →
putt. Before: `viewBox 0 0 360 640`, bands 75/75, whole-hole bottom band `NONE×5`. After:
`viewBox 0 0 360 779`, bands **0/0**, geometry hit at every probe point along the bottom edge, and
`scale` unchanged at 1.0833 — proving nothing shrank. Full suite green (1879 tests), typecheck clean.

## GS-play-hud-space — the HUD stops eating the screen, and the camera frames the golf between the panels (2026-07-26)

**The report:** "the top info section and the bottom shot section look much better but take up an awful
lot of screen space" and "the ball flight is not screen centered and keeps getting obscured by the
bottom shot window."

### What was measured

Driving the real app at 390×844 and measuring every HUD row:

| | before | |
|---|---|---|
| top info chip | 129px | of which `.gs-stats` alone was **49px** |
| bottom panel (aim) | 191px | controls column only **240px wide** of 390 |
| bottom panel (putt) | 238px | |
| HUD total | **41% aim / 46% putt** | clear band 508px / 461px |

### The fat was WRAPPING, not type size

This matters, because the previous pass (GS-hud-frame) deliberately *raised* these font sizes on a
play-test verdict that the numbers were too small to parse at a glance. Shrinking them back would have
undone a tested decision to buy space that was being wasted anyway:

- `.gs-stats` measured **49px to carry one line's worth of content** — the hole/par/distance triplet was
  being pushed onto a second line by the hole's shape/width labels ("Drivable", "Tight approach").
- The controls panel had **240 of 390px**: a 78px caddy slot (a dashed *placeholder* when no caddy is
  hired) plus a 40px button column plus gaps took a THIRD of the width, which wrapped the power read and
  the spray legend onto second lines. Vertical height spent to buy horizontal emptiness.

So: move the shape/width labels down to the CONDITIONS sub-line where they belong anyway (they are facts
about the hole, exactly like the lie and the wind), narrow the flanking columns (caddy 78→66 with the
badge keeping its frame/glow/sheen, round button 40→36, gaps 8→6), tighten padding and gaps, and replace
the power hint's "pull DOWN to power" with "pull ↓ to power" — one glyph instead of four words, and
arguably a clearer direction cue.

| | before | after |
|---|---|---|
| top chip | 129px | **95px** |
| bottom (aim) | 191px | **166px** |
| bottom (putt) | 238px | **212px** |
| HUD total | 41% / 46% | **34% / 39%** |
| clear band | 508 / 461px | **567 / 521px** |

No font size was reduced and no information was removed.

### The camera now reads the HUD it has to see around

Both panels float over a full-bleed map, and the camera ignored them entirely: `DMAP_BIAS` put the ball
at 0.84 of the frame — y≈709 on an 844px screen, against a panel whose top edge was y≈645. The ball, and
the shot the player had just hit, spent the entire flight roughly 60px INSIDE the controls. That is the
whole of the "obscured by the bottom shot window" report, and the "not screen centered" one with it.

`clearOfPanelBias(panelTop, containerH, clearance, maxBias)` (pure, in `project.ts`) biases the ball as
LOW as the panel allows and no lower — a low ball is what fills the frame with the shot AHEAD, so the
fix must not simply centre it. Clamped both ways: never past the classic 0.84, never above the middle
(where the view would fill with ground BEHIND the shot). `bandCentreBias` does the putt's equivalent,
centring the ball↔cup span in the clear band rather than the frame — the putt screen carries the tallest
panel of any state, so a frame-centred read sat low and crowded the controls.

**Two things make this safe.** First, the band is measured **per play mode** (`playBandByMode`), not off
whatever HUD happens to be in the DOM: a body is built while the PREVIOUS state's HUD is still mounted,
and the panel's height legitimately differs between states (a pace meter is taller than a power bar).
Each mode self-corrects once, on its first visit, behind a 6px threshold so content jitter (a match row,
a longer club name) cannot cause a re-render loop. Second, the resolved bias is STORED — `decisionBias`
and `puttViewBias`, exactly like the existing `decisionRadius`/`puttViewRadius` — and the watch camera
reuses the stored value rather than re-deriving it. Re-deriving would read the *watch* state's panel and
pop the camera on every single swing. `'watch'` is measured but never re-rendered for; a remount
mid-flight would restart the shot.

**Verified:** headless drive at 390×844. Ball in flight sits at y≈585 against a panel at 670 (85px clear,
mid-band) and settles to exactly `panelTop − 28`. Before, the same shot flew at 709 behind a panel at 645.
Full suite green (1879 tests + 12 in `tests/map-frame.test.ts`), typecheck clean.

---

## GS-ball-art — the ball is a golf ball, and you can see it roll (2026-07-26)

**The report:** *"part of the problem is that there is no bounce and another part of the problem is
that the ball is a pure white circle with no rolling animation. can we add dimples and a real looking
roll to the ball?"*

Both halves of that come from the same three lines. The ball was drawn at three sites in
`playView.ts` — at address, in flight/run-out, and on a putt — and every one of them was:

```js
ctx.fillStyle = '#fff';
ctx.arc(x, y, 3, 0, Math.PI * 2);
ctx.fill(); ctx.stroke();
```

A **featureless disc cannot show rotation**. There is nothing on it to rotate. And a **3px disc
cannot show height**: the shadow under it was a fixed `4×2px` ellipse whose alpha faded on
`height / (peak + 1)` — with `peak` being the *flight* apex, a half-yard run-out hop moved that ratio
by about 1%, so the shadow sat stone still. The bounce the run-out model was already drawing was
invisible; "there is no bounce" was a rendering bug, not a physics one.

### Size: the camera decides, within limits

The ball was a fixed three screen pixels at every zoom. Zooming in — the whole point of the chip/putt
camera — never showed you more ball.

The reason it was fixed is real: a golf ball is **0.0467 yards** across, and the chip/putt camera runs
at ~6.6 px/yard, so a scale model is **a third of a pixel**. A scale ball was never on the table. So
`ballRadiusPx` scales `proj.scale` about a deliberately exaggerated `ballDrawYd`, floored at the old
3px and capped at 9:

| camera | px/yard | drawn radius |
|---|---|---|
| whole hole | 0.6 – 2.4 | **3.0** (the old fixed size — that view is unchanged) |
| mid follow | 3.4 | 4.1 |
| approach | 4.6 | 5.5 |
| chip / putt | 6.6 | **7.9** (dimples, band and mark all legible) |
| deep zoom | 9+ | 9.0 (capped) |

### Rotation is the ONE thing measured in screen pixels

Every other rule in this renderer says *measure in yards, never pixels* (GS-green-complex). Roll is
the deliberate exception, and the arithmetic is why. Rolling without slipping is `dθ = ds / r`. Take
those in course units with a real ball radius and 10 yards of run is **68 revolutions** — a grey
strobe at any frame rate, and worse at the map camera than the putt camera. Take both **as drawn** —
screen displacement over drawn radius — and the ball turns exactly as fast as it *looks* like it
should, at every zoom, with no per-camera tuning. Measured over a 40-yard run-out at 60fps: 1.7 turns
at the map camera, 7.6 at the chip camera. Both readable; the test pins the band at 0.5–12.

Driving the phase off the ball's **own screen displacement** then buys the two properties that
actually sell it, for free and with no special case:

- the ball **stops turning exactly when it stops moving** (the thing that makes a run-out look like it
  settled rather than faded out), and
- a **backspin check turns it backwards** on the way home, because its displacement is backwards.

In the air on its flight it is a different regime — a struck ball carries backspin, and its screen
displacement there is tens of radians a frame *forwards*, i.e. topspin, which is both wrong and
unwatchable. So flight spins on a clock (`flightSpinRate`), the ground rolls on displacement, and the
switch is one boolean.

The per-frame step is capped at 0.55 rad. Above ~0.6 a 26-dimple field aliases and the ball reads as
turning the wrong way.

### What is actually drawn

A lit sphere (light from the upper-left, the same `LIGHT_UL` every carved feature in the scene uses —
a ball lit from anywhere else reads as a sticker), then three layers of surface detail that each
survive to a different size:

- **26 dimples** on a golden-angle spiral, orthographically projected and back-face culled, above
  `dimpleMinPx` (4.6px).
- **An alignment band**, above 2.6px. This has to be a great circle **through the roll axis's poles**,
  not around its equator: the equator of a rotation is *invariant* under that rotation and would sit
  dead still while the ball spun underneath it. Getting that backwards is a silent bug — the band
  still draws, it just never moves.
- **A maker's mark**, one dot, above 3.4px — so there is always exactly one unambiguous feature to
  track when the ball is too small for dimples.

Plus the ground shadow, which now reads the ball's actual screen **lift** — the quantity a bounce
changes. It spreads and fades as the ball climbs but never disappears: a faint mark under a ball in
the air is the only thing telling you where over the ground it is.

The dimple field is a fixed spiral, not sampled — the scene is camera-proof
(`tests/camera-stability.test.ts`) and the ball is redrawn every frame from a rebuilt projection, so
an rng dimple field would shimmer. A test greps for `Math.random`.

### Cosmetics fall out of it

`BALL_SKINS` is content-as-data: cover, shade, dimple tone, band, mark, optional aura. A new cosmetic
ball is a **row**. Seven ship (`classic` is the plain white one — this feature is about making the
ball read, not changing what the player has).

The seam to the existing wardrobe is one function. An equipped Story BALL already declares a palette
and a style for its **flight tracer** (`GolferLook.ballTracer`, GS-story-avatar); `ballSkinFor` maps
that row onto a cover and re-tints the band and aura from it. So one cosmetic dresses **both ends of
the shot** — the ball and its trail — instead of being a trail plus a second unrelated purchase, and
a NEW tracer style needs no edit here (it falls back to the tour cover with its own colours).

### Deliberately not done

- **The static SVG map still draws a plain marker.** The aim screen is `renderHoleSVG`, a different
  renderer with its own painters; a dimpled SVG ball is a `style/` module, not a shared call. Filed.
- **Per-club bounce and run** — the other half of the report. That is a physics change (it splits the
  `iron` flight class) and needs the death-spiral harness, so it is its own PR.

**Guards:** `tests/ball.test.ts` (19 cases — size floor/cap, `dθ = ds/r`, the stops-with-the-ball
property, the readable-turns band at both camera extremes, that the drawn surface actually MOVES with
the phase and returns after a full turn, that the axis follows travel, shadow behaviour, no rng, and
the skin table). Eyes-on: `node scripts/ball-preview.mjs` — every cover through a full turn, the size
ladder, a hop with its shadow, and a decelerating roll.
