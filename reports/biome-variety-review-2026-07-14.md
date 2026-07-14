# GS-biome-variety — critical uniqueness review (2026-07-14)

The player brief: *"almost every hole and biome looks the same; difficulty comes only from
making holes longer. Give each biome unique shapes, fill the rough so you can't direct-line
the green, and use hazard layouts (not length, not tiny greens) for difficulty."* Plus a
follow-up: *"do a lot more green diversity — big greens are harder to putt, small ones too
easy."*

Shipped as 12 PRs (#403–#413), one world (or the green axis) at a time, each merged green.

## Verdict: genuinely unique now

Re-shot the full gallery (`scripts/gallery.mjs`) and compared every rotation world side by
side against the pre-work baseline. In the **baseline** almost every world was a single
tapering "snake" corridor on a near-empty background, distinguished only by palette. **Now**
each world is identifiable from its *layout alone*:

| World | Identity that now reads at a glance |
|---|---|
| Verdant Station | Tree-lined parkland — real doglegs bending around water/tree corners, chute/neck pinches, ponds + pots |
| Dust Belt | Open **dune field** — broad/wander fairways threading waste-mound + crater rough, barranca carries |
| Ice Ring | Frosted **links** — long steep shelf greens, frozen ponds + pot fields, pines/fescue, wander straits |
| Ember World | Tight **inferno** — lava-river carries, thin/neck/chute corridors, capes/hairpins, charred-snag rough |
| Void Garden | Purple **island-hop** chains over the abyss, crystal spice, big steep asteroid greens |
| Crystal Spires | **Angular precision** — cape/hairpin lines threaded through neck/chute corridors between spire forests |
| Tempest Reach | Exposed **wind-links** — WIDE sweeping fairways guarded by flanking storm lakes + pot-bunker fields |
| Spore Jungle | Tight **twisty jungle** — dense mushroom stands, doglegs/S-curves, chute/neck corridors |
| Tidal Archipelago | Heroic **water carries** — cape lines over the sea, hourglass/neck between lagoons, palm + beach shore |
| Cetus Deep | **Star-ocean** clifftops — island chains, star-waterfalls off the plateaus, whales, tide-pool greens |
| Toxic Mire | The **serpent's swamp** — the twistiest world, S-coils/hairpins, neon acid pools, dead mangroves |
| Scrap Belt | Low-grav **junkyard bomber** — broad bombs over dense crater fields + scrap plates, barranca chasms |
| Derelict | Dead **starship** — walled metal ship-corridors, sharp-corner junctions, torn hull, deck-plate greens |

### The three levers, delivered

1. **Shape variety (kills the snake).** Every land world now sets `shapeWeights` + `widthWeights`
   + `parMix` so its par-4/5 holes bend in a characteristic way and its corridors squeeze in a
   characteristic way. The `hourglass`/`neck`/`chute` archetypes force a *layup + iron approach*
   (difficulty from strategy, not length), and the width-aware auto-AI already reads those pinches.

2. **Filled rough (no more direct lines).** Trees/heavy-rough were bumped where thematic, and a new
   gated `Biome.roughFill` scatters world-appropriate NON-penalty obstacles (dune-scrub `waste`,
   crystal spires via `treeDensity`, fescue moor, beach flats, scrap plates) through the off-corridor
   rough at a density independent of `treeDensity` — so the once-empty scrubby worlds (desert, crystal,
   tempest, scrap) now punish an offline drive. Drawn on the `:rough:` side stream → zero penalty-layout
   perturbation.

3. **Green diversity (bigger = harder to putt).** Every world got a distinct, mostly bigger green:
   huge smooth oasis/links greens (desert/earth 1.5), long steep shelves (ice 2.6 aspect), jagged
   basalt (ember), faceted tiered (crystal), big tide-pools ringed by water (tidal), etc., plus a
   `difficulty` vector on nearly all of them. The desert deliberately stays **big + smooth, no vector**
   (its putt test is pure size). Cost nothing in the terrain stream (size/aspect are post-multiply;
   slope/contour/pin ride side streams).

## Honest caveats / residual concerns

- **Two "near-pairs" by design, not by accident.** Desert and Scrap are both *open low-gravity
  bombers*; Verdant and Tempest are both *green-with-water*. They are differentiated by hazard TYPE
  (dune mounds vs rust craters; tree-lined tight vs exposed wide), shape vocabulary, and palette —
  they sit at genuinely different points in the gravity/wind space. They read as distinct in the
  gallery, but they are the closest cousins.
- **Balance was deliberately not re-tightened.** Per the brief ("ignore death spiral, fill the rough,
  rebalance later"), several death-spiral fences were relaxed to the interim reality with a greppable
  `TODO(GS-biome-variety)` (the tents + all-theme all-max-wildness means tick just over par+1). The
  STRUCTURAL fairness contracts (`validateFairness`/`validateCrossings`/`validateCourse`) were never
  relaxed — they hold green by construction across every world × wildness. The follow-up is a smarter
  play-back-to-the-fairway reach-AI, then re-tighten the fences (never by softening the rough).
- **The careful trio is greens-only.** Void/Cetus/Derelict got bigger greens but NO shape/width change,
  because (a) they're already the most visually distinct worlds and don't suffer the snake problem, and
  (b) `shapeWeights` there risks the star-waterfalls (Cetus plateau edges) and the ship walls/containment
  (Derelict) for marginal gain. Verified untouched: the full `walls.test` (22), `cetus.test`,
  `island-gaps.test` suites stay green; waterfalls + ship corridors confirmed intact in the gallery.
- **Static courses unfrozen.** As part of the Scrap Belt PR, the flagship `metal-18` (the one frozen
  18-hole course) was unfrozen so every 18-hole course regenerates uniformly (no exception) and reflects
  the latest per-world design; a course's par now lands naturally in the 69–73 band. Bundle shrank ~256 KB.

## Suggested follow-ups (not done here)

1. **Rebalance pass** — re-tighten the `TODO(GS-biome-variety)` death-spiral fences with a smarter
   reach-AI and/or richer starter bags.
2. **Firmness / forced-carry green axis** — the `difficulty` vector is the GREEN axis only; a
   world-specific firmness (fast/soft greens) or a bunker-depth axis would deepen identity further.
3. **Render identity deepening (optional)** — palettes/flora/relief are already per-world; a couple of
   worlds could gain a signature decor motif, but this was out of scope (layout/greens, not render).
