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
  horizontal bands — perpendicular-to-play after the projector rotates tee→green up) on fairway/green;
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
  (never a flat wash), the showpiece (glowing moon with halo+craters / gradient-trailed meteors with bright
  heads / shimmering layered aurora curtains / a pulsing solar flare + edge vignette + crackle / drifting
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
  matches the decision map's zoom (no jump — also closed the decision↔animation projector mismatch). `Projector.unproject` is the inverse (screen→course) that
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
