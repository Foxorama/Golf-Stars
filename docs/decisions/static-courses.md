# Static courses (GS-static-courses)

**Constitution bullet:** see `CLAUDE.md` → *Generator & sim*. This file holds the why.

## The problem

Every existing mode builds each stop from a *fresh* seed (`generateStopCourse` off `stopSeed(run)`),
so no two plays are the same course — that's the whole point of a procedural travelling-golf RPG.
A future game mode wants the opposite: a **designed, repeatable full 18-hole round** you can learn,
shot-plan, and replay — the same course every time, like a real-world signature course.

## The decision

A static course has **two representations of one identity**, and we keep both:

1. **A frozen JSON data file** (`src/sim/course/static/<id>.json`) — the *default* served to players.
   It is byte-identical **forever**, even across `GENERATOR_VERSION` bumps that would re-roll a
   from-seed course. This is what "static" should mean for a course you learn and replay.
2. **A pinned spec** (`seed` + `GenerateOptions`) that rebuilds the course through the *same*
   `generateCourse` pipeline as everything else — the **redesign / season / rebalance** path. Because
   the engine is deterministic, the spec reproduces the design; running the freezer script re-bakes
   the JSON from it.

Why keep both rather than just one:

- **Frozen-only** (hand-authored polygons) would bypass the five generator validators (`validateCourse`
  / `validateFairness` / `validateCrossings` / `validateGreenApproach` / `validateIslandHops`) that make
  a course fair *by construction*, and couldn't be re-tuned without hand-editing geometry.
- **Spec-only** (build from seed at runtime) drifts on every `GENERATOR_VERSION` bump — the opposite of
  "the same course every play" for a course players are meant to memorise.
- Keeping both gives a truly stable artifact **and** a one-command regeneration for a seasonal redesign
  or a "this doesn't play well, re-roll it" pass. The freezer re-validates the (rounded) course through
  all five validators, so a redesign can never freeze an unfair hole.

Precision: course-space is YARDS and the generator emits ~15-digit floats. The freezer rounds every
number to **3 decimals** (0.001 yd — imperceptible) before writing, then re-validates, and the JSON is
**minified** (a generated artifact, never hand-edited) — ~262 KB vs ~1.3 MB raw (gzips to ~the same).

## Shape

- `src/sim/course/staticCourseSpecs.ts` — the GENERATION half (no frozen-data import, so the freezer
  can bootstrap): `StaticCourseSpec { id, name, seed, opts }`, the `STATIC_COURSES` catalogue, and
  `regenerateStaticCourse(spec | id)` (builds through `generateCourse`, mirrors `generateStopCourse`'s
  retry ladder as a forward-compat guard, stamps the spec's `name` over the random star-name). **A new
  static course is a new row here**, never an engine edit.
- `src/sim/course/staticCourses.ts` — the PLAYABLE half, re-exports the specs + serves data:
  - `buildStaticCourse(id)` / `metalEighteen()` → the **frozen** data (deep-cloned per call, so the
    run path's in-place hole stamping can't corrupt the shared singleton; falls back to regeneration if
    a spec has no frozen file yet).
  - `buildStaticCourse(id, { regenerate: true })` / `regenerateStaticCourse(id)` → rebuild from spec.
- `src/sim/course/static/<id>.json` — the frozen data, produced by the freezer.
- `scripts/gen-static-courses.mjs` (`npm run gen:courses [id]`) — regenerates + rounds + re-validates
  + rewrites the frozen JSON. Run it deliberately after a spec change, then commit the JSON.

### `metal-18` — "Antlia Scrapworks"

- Biome `scrap-belt` (the **metal** archetype: low-gravity bombs `carryMult 1.32`, blast-crater
  bunkers, scrap-waste bands slashing the fairways, a drifting-hull **barranca** forced carry).
- `{ holes: 18, compose: true, wildness: 0.5 }` → a composed par-**71** routing (front 35 / back 36;
  5 par-3s, 9 par-4s, 4 par-5s), two drivable-par-4 signatures, a mean-preserving difficulty arc, no
  triple-par run. Mid wildness so the Scrap Belt's character reads without deep-game brutality.
- Seed `gs-static:metal-18`. Total ~9,255 yd — long because the low-gravity `carryMult` scales holes
  up to keep every carry *carry-relative* (the auto-AI reaches exactly as elsewhere; fair by design).

## Why this changes nothing for existing modes

**Nothing in the run/format path imports `staticCourses.ts`.** No format row, no `currentCourse`
branch, no shared rng stream is touched — so every current mode is byte-for-byte unchanged (the
determinism contract holds trivially). The module is inert content sitting ready; the future mode
opts in by calling `buildStaticCourse`. No new `_gs*`/URL hook, so no test-hub wiring is needed.

Guarded by `tests/static-courses.test.ts` (frozen: 18 holes, biome, par 71 F35/B36, mix, no-triple,
3-decimal rounding, byte-stability, independent deep copies, all validators clean; regenerate: valid
par-71 rebuild + deterministic; catalogue lookups + unknown-id throws). The test does **not** assert
frozen == regenerated — that would defeat freezing (a version bump would force a re-freeze); the two
are validated independently, and the frozen file is re-baked deliberately via `npm run gen:courses`.
