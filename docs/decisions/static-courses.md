# Static courses (GS-static-courses)

**Constitution bullet:** see `CLAUDE.md` → *Generator & sim*. This file holds the why.

## The problem

Every existing mode builds each stop from a *fresh* seed (`generateStopCourse` off `stopSeed(run)`),
so no two plays are the same course — that's the whole point of a procedural travelling-golf RPG.
A future game mode wants the opposite: a **designed, repeatable full 18-hole round** you can learn,
shot-plan, and replay — the same course every time, like a real-world signature course.

## The decision

A static course is just a **named, pinned seed + generation options**, resolved through the *same*
`generateCourse` pipeline as everything else. Because the whole engine is deterministic
(`(seed, opts, GENERATOR_VERSION) → identical Course`), a pinned seed already *is* "the same course
every play." We did **not** hand-author literal `Hole` geometry as frozen JSON:

- Hand-authored polygons would bypass the five generator validators (`validateCourse` /
  `validateFairness` / `validateCrossings` / `validateGreenApproach` / `validateIslandHops`) that
  make a course fair *by construction* — the exact machinery that keeps the game honest.
- Frozen JSON can't pick up new contract fields as the renderer/sim evolve; a regenerated course is
  always contract-current.
- A pinned seed is a few lines and stays in-idiom with the seeded-determinism architecture (contract 1).

Trade-off, stated plainly: a `GENERATOR_VERSION` bump *re-rolls* the exact geometry (it does for
every course in the game). "Static" here means **fixed within a released version**, not frozen
against engine changes. If a course ever needs to be frozen forever regardless of version, serialize
its built `Course` to a data file — but that's premature until a mode needs it.

## Shape

`src/sim/course/staticCourses.ts` — content, not code:

- `StaticCourseSpec { id, name, seed, opts }` and a `STATIC_COURSES` catalogue array. **A new static
  course is a new row**, never an engine edit.
- `buildStaticCourse(spec | id)` mirrors `generateStopCourse`'s retry ladder (a pinned seed a later
  version happens to trip re-rolls deterministically rather than throwing into the caller) and stamps
  the spec's `name` over the generator's random star-name. The canonical rows all succeed on attempt 0
  today, so the ladder is a forward-compat guard, not a live path.
- `metalEighteen()` / `METAL_18_ID` — the flagship row.

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

Guarded by `tests/static-courses.test.ts` (18 holes, biome, par 71 F35/B36, mix, no-triple,
determinism, all validators clean, catalogue lookups).
