# Why every biome plays the same course — diagnosis & a plan for real variety

**2026-07-13.** Investigation prompted by: *"almost every biome has the exact same effective
course layout, and increased difficulty is almost always 'the hole gets longer'."* The player
wants to grow biomes into full 9/18-hole courses and add more worlds, but each world must feel
like a genuinely different course — not the same 2–3 holes replayed nine times.

This report answers three questions: **(1) why are the holes almost identical, (2) what has to
change in the project files to allow more unique layouts, (3) how to make difficulty more than
"longer."** It ends with a phased plan that respects the locked contracts (determinism,
fairness-by-construction, auto≡interactive, no-death-spiral).

---

## TL;DR

Every hole in the game is **one tee→green corridor** built from **one centreline** (`buildCentreline`)
that is one of five shapes (straight / dogleg / cape / hairpin / S), with **0–2 bends**, hazards
kept *out* of the corridor by `validateFairness`. Biomes differ only by a handful of **scalars and
skins** layered on that identical skeleton — gravity (= length), wind, a single width multiplier, a
single `doglegBias`, hazard *colour/penalty* swaps, green shape, scatter surface, tree density. None
of those change the **strategic structure** of a hole. The two worlds that DO feel different —
void/cetus (island-hop) and the derelict (walled hallway) — are the only ones that changed
**structure**, and they each required a bespoke, special-cased code branch. That is the proof of
the mechanism: **structure lives in engine code, not in biome data, so a data-only "new world" can
only ever be a reskin.** Difficulty reads as "longer" because the single `wildness` scalar pushes
every lever at once, and the deep worlds happen to be the low-gravity (long) ones — length and
depth are coupled through `carryMult`.

The fix is to promote **hole-design language** from hardcoded global constants into **per-biome
data**: par/length distribution, shape vocabulary, width-archetype weighting, a small set of
**structural hole archetypes**, and a **per-biome difficulty vector** (which levers ramp with
depth). Plus a second, orthogonal dimension the game entirely lacks today: **intra-course
composition** — deliberately varying hole-to-hole so a 9/18 doesn't repeat itself.

---

## 1. Why the holes are almost entirely the same layout

### 1a. There is exactly one hole *skeleton* in the whole engine

`generateHole` → `buildCentreline` produces a **single polyline from tee to green**, and everything
downstream (fairway ribbon, hazards, scatter, green, apron) is derived from that one line via
`centrePoint`/`perpAt`. The centreline is one of five shapes (`generate.ts:2061`):

- `straight`, `dogleg`, `cape`, `hairpin`, `double` (S-curve)

That's the entire structural vocabulary. Every hole in every biome is *"a ribbon with 0–2 bends,
green on the end."* There is no split fairway, no alternate route, no genuine risk-reward second
landing zone, no double green, no blind shot, no elevation, no punchbowl/redan as a first-class
design — the geometry pipeline literally cannot express them.

### 1b. Biome identity is skin + scalars, by explicit design

`biomes.ts` is documented as *"Pure & physics-only… Render concerns live in the render layer keyed
by biome id."* A biome row can set:

| Lever | What it actually changes | Structural? |
|---|---|---|
| `carryMult` | hole **length** (gravity) | no — uniform scale |
| `windBase/windWild` | wind strength | no |
| `fairwayWidthMult` | one width scalar | no |
| `doglegBias` (0.25–0.45 across ALL worlds) | bend tendency | weak — a 0.2-wide band |
| `hazardKinds` | water→lava→void→acid **swap** | no — same placement, different colour/penalty |
| `greenSize/Aspect/Irregular/SlopeMax` | green **shape** | cosmetic-ish |
| `scatter` | ice/crystal/waste **lie skin** | no |
| `treeDensity`, `fairwayBunkers`, `ponds`, … | hazard **counts** | no |

Every one of these is a **scalar or a skin over the same skeleton.** Swap lava for water for acid
and the hole plays identically — the hazard is still a greenside ring or a single forced-carry
crossing kept clear of the corridor. `doglegBias` is the only shape input and it spans a tiny
0.25–0.45 band, so no world is meaningfully bendier than another.

### 1c. Par and length are the same distribution everywhere

`chooseTemplate` (`generate.ts:1693`) uses **globally hardcoded** rolls for *every* biome:

- par mix: `parRoll < 0.25 → 3`, `< 0.8 → 4`, else `5` (≈25/55/20, identical in all worlds)
- length classes: the same drivable/normal/long multipliers for all worlds
- `baseLen = par 3 ? 165 : par 4 ? 400 : 530`, then `× carryMult × lenMult`

The **only** biome input to length is `carryMult`, and it scales the whole hole uniformly. So no
world has a design identity like "short & tactical" vs "long & heroic" — they all have the same par
sequence statistics and the same relative length spread. A desert and a jungle draw par and length
from byte-identical distributions.

### 1d. The width grammar is biome-independent

`chooseWidthProfile` (`generate.ts:1845`) draws chute/neck/hourglass/wander/thin/broad from a pool
with **no biome bias at all** (only the island/ship special cases branch out). A links world and a
parkland world get the same width-archetype distribution. The one genuine "shape variety" system we
have is deliberately *decoupled* from world identity.

### 1e. Fairness-by-construction flattens the strategy

`validateFairness` guarantees penalty hazards stay off the tee→green corridor; `generateCourse`
throws otherwise. This is a load-bearing fairness contract — but it also means the **only** strategic
decision on almost every hole is *"which club, aim up/down the one clean corridor."* The design log
already caught this: GS-rivers-2 records the player saying *"the enforced fairness layer is what makes
the holes keep the exact same shape."* The mitigations so far (variable crossing position, width
archetypes, rough gradient) all operate *within* the single-corridor frame, so they add texture but
not structural variety.

### 1f. The two worlds that feel different prove the point

Void/Cetus (`lostRough`) and the Derelict (`walls` + `sharpCorners`) are the only worlds players
would call *structurally* distinct — island-hop pad chains and walled hallways. Both required
**bespoke engine branches** (`islandPar3`, `separateIslandGaps`, `buildShipWalls`, `SHIP_CORRIDOR_SCALE`,
the `ship`/`sharp` sampling in `buildCentreline`, and a large `sim/walls.ts`). They are hand-coded
special cases, not data. **That is exactly why they're the only ones that feel different, and exactly
why a data-only new world can't be.**

### 1g. No intra-course composition

`generateCourse` is `for (i…) holes.push(generateHole(…))` — every hole is an **independent, identically
distributed draw**. There is no routing logic that says "don't put two long doglegs back to back," no
deliberate par sequence, no signature stretch, no "hardest hole at 9/18." A 9-hole stop is nine IID
samples from one distribution, which is precisely why it would read as *"the same 2–3 holes over and
over."* Real courses are *composed*; ours are *sampled*.

---

## 2. What has to change in the project files

The theme of the fix: **lift hole structure and difficulty from engine constants into per-biome
data, and add a composition layer above the per-hole generator.** Concretely:

### 2a. Make the par/length distribution a biome property
`chooseTemplate`'s hardcoded par roll and length classes should read from a per-biome
`ParProfile` / `LengthProfile` (new optional `Biome` fields, defaulting to today's values so
existing worlds are byte-identical until opted in). This lets a world *own* a rhythm — e.g. a links
world skews short-par-4 + drivable; a gas-giant skews long par-5; a "short course" world is par-3
heavy. This alone breaks the "same par mix everywhere" read.

### 2b. Make the shape vocabulary biome-weighted
Today `straightP/hairP/capeP/sP` (`generate.ts:1777`) are near-global, nudged only by the narrow
`doglegBias`. Give each biome a **shape weight vector** (a `Partial<Record<ShapeKind, number>>`), so
a desert = straight + cape carries, a jungle = tight doglegs + hairpins, a storm world = S-curves.
Widen the effective `doglegBias` spread while you're there.

### 2c. Bias the width-archetype pool per biome
`chooseWidthProfile` should take a per-biome weight over {classic, chute, neck, hourglass, wander,
thin, broad}. Links → wander/broad; US-Open world → thin/neck; parkland → classic/chute.

### 2d. Generalise "structural hole archetype" — the big one
Today island-hop and walled are special-cased booleans. Introduce a first-class notion of a **hole
STRUCTURE** that the generator can build, and let a biome carry a weighted set of the ones it uses:

- `single-corridor` (today's default)
- `island-hop` (generalise the void chain)
- `walled-corridor` (generalise the derelict)
- **new** `split-fairway` (two genuinely separate routes to the green — high road / low road, each
  with its own risk; the *real* answer to "same shape every hole" because it doubles the strategic
  decision and is still fairness-provable per route)
- **new** `double-green` / `alternate-green` (two greens, pin picks one — cheap variety, big feel)
- **new** `redan` / `punchbowl` / `biarritz` green-complex archetypes as first-class (approach angle
  matters, not just distance)

Each archetype is a builder with its own fairness proof; a biome names which it draws from. This is
the structural lever the game is missing, and it's the highest-leverage change for "feels like a
different course."

### 2e. Replace the single `wildness` scalar with a per-biome difficulty VECTOR
See §3 — this is where "not just longer" lives.

### 2f. Add a composition layer above `generateHole`
A `composeCourse(biome, wildness, n)` that decides the *sequence* before generating: enforce
hole-to-hole contrast (no two adjacent holes same par+shape+length band), place 1–2 **signature
holes** per 9 (a drivable par-4, an island par-3, the split-fairway), and shape a difficulty arc
(gentle open, teeth in the middle/finish). This is what turns nine samples into a *round*. It's new
code but it sits *above* the frozen contract and per-hole generator — no contract change.

### Constraints every one of these must honour (non-negotiable)
- **Determinism / byte-stability:** every new draw gates behind its feature being armed and appends
  after existing draws; default (feature-off) path draws zero extra rng. Bump `GENERATOR_VERSION`,
  re-pin the seeded fixtures, re-run the suite.
- **Fairness-by-construction:** every new structure needs its own validator (like
  `validateIslandHops`) proving the route(s) carryable and penalty-free; `generateCourse` throws on
  violation — no retry-and-hope.
- **auto ≡ interactive:** any structure that changes shot resolution threads through both drivers
  identically.
- **No death spiral:** re-run the harness after any lever change; a structure/difficulty axis must
  keep `toPar/hole` under the bar (relaxed worlds excepted, deliberately).

---

## 3. How to make difficulty more than "the hole gets longer"

### Why it reads as "longer" today
`wildness` is one scalar derived from distance (`0.1 + distance·0.05 + jitter`). It drives **all**
of these at once, uniformly, in every world: `widthScale = 2.0 − 1.25·wildness` (tighter), `dogFac =
0.5 + 0.5·wildness` (bendier), hazard counts `×(0.4+wildness)`, green tilt floor rises, rough
gradient thickens. **And** the deepest worlds are the low-gravity ones (void 1.4, scrap 1.32,
derelict 1.3, cetus 1.12), whose `carryMult` makes holes physically longer. So depth ⇒ long is
baked in through gravity, and every other lever moves in lockstep behind it. The player correctly
perceives one monotone knob whose most visible output is length.

### Decouple length from difficulty
Length and depth are coupled only because deep worlds are low-gravity. Break it: a world can be made
hard **without** adding yards. Toxic Mire already hints at this (heavy air ⇒ *short* holes, hard via
water + tight coils) but it's the lone exception. Make it a design axis.

### Give each biome a difficulty VECTOR, not a scalar
Add a per-biome `DifficultyProfile`: weights for **which levers ramp with depth**. Same `wildness`,
different feel:

- **Tightness world** — width shrinks hard, hazards pinch the driving zone; length flat.
- **Wind world** — `windWild` dominates; corridors stay generous. (Tempest/Ice partly do this.)
- **Green-complexity world** — more/steeper contour lobes, severe pin tucking, faster surfaces; the
  challenge is the *approach and putt*, not the drive.
- **Hazard-density world** — more forced carries, tighter carry windows, landing-zone bunkering.
- **Rough/recovery world** — punishing rough gradient, deep-rough choke; miss = real cost.
- **Length world** — the current model, now *one option among several* rather than the default.

### New difficulty levers that aren't length (cheap wins, mostly render+data already present)
- **Green contour complexity** — `greenContour` already supports 1–2 lobes; let depth push count &
  magnitude. Two-way breakers are hard and cost zero yards.
- **Pin tuck severity** — the pin rng (`:pin:`) already exists; ramp the off-centroid fraction with
  depth so deep pins are genuinely tucked.
- **Firmness / bounce** — a per-biome firmness that makes greens hold or repel; a firm fast green is
  hard at any length.
- **Forced-carry frequency & carry-window length** — make the sanctioned crossing bite harder (a
  longer carry, later in the hole) rather than making the whole hole longer.
- **Driving-zone pinch** — the width-AI lever (`pinchHalfWidth`) already reads a genuine pinch; ramp
  the pinch, not the length, on tightness worlds.
- **Crosswind severity & gust jitter** — `carryJitter` + wind, per world.
- **Lie difficulty** — more bad-lie scatter in landing zones on "rough" worlds.

### Keep the death-spiral bar honest
Each new axis is measured on **mean per-stop Stableford**, not distance (distance is chaotic — that's
literally in the contract). A harder-via-tightness world must still clear the bar; the balance
harness stays the guard. Ramp ONE axis at a time and re-measure.

---

## 4. Suggested phasing (one focused PR each — CLAUDE.md's one-feature rule)

1. **Composition layer** (`composeCourse`) — hole-to-hole contrast + a difficulty arc + 1 signature
   hole per 9. Pure sequencing over the existing generator; biggest felt win for the least risk, and
   it's exactly what a 9/18 needs. No contract change.
2. **Per-biome par/length/shape/width profiles** — new optional `Biome` fields, defaults = today.
   Retune 2–3 worlds to distinct rhythms as the proof.
3. **Per-biome difficulty vector** — split `wildness` into a weighted lever set; decouple length
   from depth; add green-complexity + pin-tuck + firmness as ramping axes.
4. **A new structural archetype** — `split-fairway` first (highest strategic payoff, and its
   fairness proof is a clean extension of the crossing/island validators). Then generalise
   island-hop/walled from special cases into the archetype registry so future worlds pick them as
   data.
5. **New biomes** — only after 1–4, because only then can a new world be *data* that expresses a
   real identity instead of a reskin.

The order matters: adding biomes *first* (the tempting move) just multiplies reskins. Building the
variety machinery first means every future world is a genuinely different course for free.

---

## Key code references
- `src/sim/course/generate.ts` — `generateHole` (785), `chooseTemplate` (1693), `chooseWidthProfile`
  (1845), `buildCentreline` (2017), `generateCourse` (2108, IID hole loop at 2126), the fairness /
  crossing / island validators (2160+).
- `src/sim/course/biomes.ts` — the biome table; note how every "signature" is a scalar/boolean skin
  except `lostRough`/`walls`, the two that needed engine branches.
- `src/sim/course/contract.ts` — the frozen `Hole`/`Course` contract new structures must fit.
- `docs/decisions/sim-generator.md` — the full history; GS-rivers-2 is the prior art on this exact
  complaint ("fairness layer keeps holes the same shape").
