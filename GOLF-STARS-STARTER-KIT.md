# Golf Stars — Starter Kit

*A travelling space golf RPG: voyage the galaxy playing ever-wilder, procedurally-generated
golf courses. This kit is everything you need to stand up the new repo so you never have to
re-architect it later. Generated from a read-only pass over `golf-finder` — golf-finder itself
was not modified.*

---

## 0. Why this is a file and not a repo (read first)

I could not create `Foxorama/golf-stars` from the golf-finder session: that session's GitHub
token is scoped to `golf-finder` only, so both "create repo" and "push to another repo" are
denied (`403 Resource not accessible by integration`). Nothing is lost — this kit contains the
harvest list, the game-adapted instruction set, and the architecture decisions to lock up front.

**To execute it:**
1. Create the empty repo yourself: GitHub → New repository → `golf-stars` → add a README so it's
   clonable. (Public if you want GitHub Pages like golf-finder; private is fine to start.)
2. Open a **new Claude Code session scoped to `Foxorama/golf-stars`** (Claude Code on the web:
   pick that repo as the source; or locally `git clone` it and run Claude there).
3. Drop this file in at the repo root, point that session at it, and have it scaffold §3–§7.
   That session has a working directory in the new repo and can actually run the tests + CI.

**Keep the two products fully separate** — no shared repo, no shared deploy, no cross-imports.
golf-finder's soul is *realism and trust*; Golf Stars' soul is *fantasy, feel, and progression*.
Harvest the parts below as a **starting copy**, then let them diverge. Do not try to keep a
"shared library" in sync between them — that coupling is exactly what you don't want.

---

## 1. Harvest manifest — what to lift from golf-finder

All line numbers are in `golf-finder/index.html` (9,048 lines) as of this pass. Treat them as
"copy this function/region as a *starting point*, then adapt," not as a live dependency.

### LIFT — copy the logic almost verbatim (this is real, reusable golf/RPG domain code)

| What | Where in index.html | Becomes in Golf Stars |
|---|---|---|
| **Bag taxonomy** `CLUBS` | `:6943` | The player's club set — same 26-key longest→shortest list is a fine starting bag; RPG can unlock/upgrade clubs as loot. |
| **Club carry + suggestion** `clubDist` `:6982`, `clubAvg` `:6970`, `addClubShot` `:6968`, `suggestClub` `:7006` | `:6968–7060` | Club selection / "what reaches the pin" logic. The `'reach'` vs `'nearest'` modes (shortest club that carries the distance vs closest-carry) are exactly what an arcade golf game needs. |
| **Plays-like wind** `_playsLike` `:7932`, `windVsHole` `:7894`, `playWind` `:7881` | `:7881–7980` | Wind-vs-shot-bearing math (head/tail/cross off the *shot* bearing, not the hole). Keep it — even fantasy courses have wind. Drop the "it's only a forecast" conservatism; a game can be exact. |
| **Scoring / Stableford / handicap** `playTotals` `:7185`, `courseHandicap` `:7687`, `strokesForSI` `:7706` | `:7185, 7687–7720` | Score model. Stableford especially suits a roguelike (points per hole → run score). Handicap/SI is optional for a game but the net/points math is reusable. |
| **Stats engine** `PLAY-STATS-CORE` block, `psAggregate` `:7435` | `:7394–7520` (markers `PLAY-STATS-CORE-START/END`) | **This is the gold pattern, not just the code.** It's a *pure, DOM-free, no-globals* region that is unit-tested from Node. Generalize this into Golf Stars' entire simulation layer (see §4). |
| **Lie model** `LIE_INFO` `:7198`, point-in-polygon lie read | `:7198–7285` | Surface→lie mapping (water/bunker/green/fairway/rough…). Drives shot difficulty. Reusable as-is; add fantasy lies (lava, lowgrav, crystal). |
| **Penalty model** `PEN_INFO` | `:7285` | Water/OB/lost/unplayable stroke logic. |

### LIFT-AND-REPURPOSE — the renderer is geometry-agnostic; feed it generated polygons

| What | Where | Note |
|---|---|---|
| **Hole renderer** `playHoleSvg` `:8083`, the `uv()` play-line-up rotation, `inFrame` cropping, hazards-on-top layer order | `:8083+` | Currently eats *baked OSM* polygons. It will just as happily render **procedurally-generated** fairway/green/bunker/water polygons. This is your bridge from "real courses" to "generated courses" — the single highest-leverage reuse. Keep the play-line-up (tee bottom, green up) convention. |
| **Rarity / loot system** `RARITY_C` `:3978`, `rarCol` `:3981` | `:3978–3981` | common→blue, rare→green/teal, epic→purple, legendary→orange. This is *already* RPG loot grading. Use it for course rarity, club/item drops, biome tiers. |
| **Card template + art phasing** `buildCard` `:4079`, the Astral-Heroic two-phase emblem | `:4079+` + the `astral-heroic-card-art` skill | The collectible-card visual language (chart↔hero morph, rarity accent). Repurpose for "course discovered" cards and item cards. |
| **Flux art pipeline** | `astral-heroic-card-art` skill + CLAUDE.md "registered-hero" recipe | The whole `request_upload_url`→PUT→`generate_image(flux2_max)`→`get_history`→download flow. Repoint prompts from constellations to **generated course/biome/boss-planet art**. |

### REFERENCE ONLY — read for patterns, don't copy the code

- **`altAz()` `:3332`, `projFigure` `:3985`, star catalogs** — real J2000 astronomy. A *space* game
  wants stylized/generated skyboxes, not real star positions. Borrow the *look*, not the data.
  (If you ever want a "real constellations as you travel" flavor mode, the projection math is here.)
- **Tee colours `TEE_DOT` `:7153`, meteor showers `SHOWERS` `:5128`** — domain-specific to the real
  app; cherry-pick only if a feature needs them.

### LEAVE BEHIND — actively wrong for a game (do not carry)

GPS / geolocation, Kalman GPS smoothing, OSM/Overpass fetch (`scripts/build-course-maps.mjs`,
`course-maps.json`), Open-Meteo weather, sunrise/sunset APIs, the day course-finder, the
service-worker-as-offline-utility framing, real-location region picker, device-orientation
compass/tilt code. All of it is "be faithful to the real world" plumbing — the opposite of a game.

---

## 2. The one thing golf-finder gives you *nothing* for

**A procedural course generator.** golf-finder bakes *real* geometry; it has zero generative
content. Golf Stars is ~90% "what makes course N+1 wilder and still fair?" Budget for this as the
actual new project. golf-finder hands you the **renderer** (`playHoleSvg`) and the **sim**
(clubs/wind/lie/scoring) that consume a course — so design the generator to **emit the same
polygon+centreline shape `playHoleSvg` already understands**, and both harvested halves drop on
either side of it. Lock the generator's output contract early (§4) and you won't re-plumb later.

---

## 3. Architecture decisions to make ONCE, now (so nothing gets redesigned)

These are the irreversible-if-wrong calls. golf-finder got away with "single 190 KB HTML, no build"
because it's a utility. A game must not inherit that. Decide each of these on day one:

1. **Build system / framework — DO NOT inherit the single-file no-build model.**
   Recommended: **Vite + TypeScript**. Gives you modules, types (your save schemas and the course
   contract become real types), HMR, and a real test runner. This is the single biggest "redesign
   later if skipped" item. (golf-finder's `index.html` monolith fought every feature; don't repeat it.)

2. **Rendering target — decide before writing UI.**
   - SVG/DOM (golf-finder's approach) is fine for static hole maps + cards, weak for animated ball
     flight / physics / particles / lots of moving sprites.
   - Recommended: **Canvas2D for the play view + ball physics, DOM/CSS for menus/cards/HUD.**
     Reach for a small engine (PixiJS) or WebGL only if you find Canvas2D limiting. Pick now; porting
     the play view between render targets later is a full rewrite of the most important screen.

3. **Sim ↔ render separation (generalize the `PLAY-STATS-CORE` pattern).**
   Make the **entire game simulation pure, deterministic, and headless** — no DOM, no globals,
   seeded RNG in, state out. Rendering is a thin layer that reads sim state. This is the biggest
   lesson golf-finder already proved: its stats core is DOM-free *specifically so Node can unit-test
   it*. Do that for the whole game (shot resolution, course gen, RPG progression), not just stats.
   Then `tests/` can simulate entire runs headlessly.

4. **Deterministic seeded generation.**
   Course/run generation must be **seed → reproducible course**. One seedable PRNG (e.g. mulberry32),
   threaded everywhere; ban `Math.random()` in the sim. Pays off for: shareable run seeds, daily
   challenges, save/restore mid-run, and reproducible test failures. Retrofitting determinism after
   the fact is painful — do it from commit 1.

5. **Versioned save schema from v1.**
   golf-finder learned this the hard way: it carries `gf_club_schema` migrations, `v:2` round
   records, backfill code (see CLAUDE.md "schema migration"). Start every persisted blob with a
   `version` field and a `migrate(old)→new` function from the very first save. Namespace keys
   (`gs_*`). One export/import-to-JSON path from day one (golf-finder's `playExportData`/`ImportData`
   is the model — localStorage is the only copy, so backup is not optional).

6. **Content as data, not code.**
   Clubs, lies, biomes, course "wildness" rules, RPG items, enemies/bosses, shop economy — all
   **data tables** the sim reads, not hardcoded logic. golf-finder already does this (`CLUBS`,
   `LIE_INFO`, `PEN_INFO`, `RARITY_C`). Extend the discipline so designing a new biome = adding a
   row, not editing the engine.

7. **Define the RPG meta-loop early (the part golf-finder has none of).**
   The roguelike spine: **travel → arrive at a planet/course (rarity-graded) → play it for a
   reward → spend on upgrades/clubs/perks → travel further, difficulty + wildness scale up.**
   Sketch the run structure, the currency, what persists between runs vs resets, and the
   fail/end state *before* building screens. Reference points: *Cursed to Golf* (golf roguelike),
   *What the Golf* (escalating absurdity), *Golf Story* (RPG framing).

---

## 4. The course contract (lock this interface, build freely behind it)

Define this TypeScript interface first; the generator produces it, `playHoleSvg`-descendant
consumes it, and the sim scores it. As long as this contract holds, you can rewrite the generator
and the renderer independently forever.

```ts
type Vec = [number, number];               // course-space units (not lat/lng)

interface Hole {
  par: number;
  tee: Vec;
  green: Vec;
  centreline: Vec[];                        // play-line; renderer rotates tee→green up-screen
  features: Feature[];                      // generated polygons (the OSM analogue)
  hazards: Feature[];                       // drawn last / on top, per golf-finder layer rule
  wind?: { dir: number; spd: number };      // per-hole or per-course
  biomeMods?: BiomeMod[];                   // lava lie, low-gravity carry mult, moving green…
}

interface Feature { kind: 'fairway'|'green'|'bunker'|'water'|'rough'|'waste'|/*fantasy*/string; poly: Vec[]; }

interface Course {
  seed: number;                             // reproducible
  rarity: 'common'|'rare'|'epic'|'legendary';
  biome: string;                            // drives art + lie/physics mods
  holes: Hole[];
  meta: { name: string; distanceFromStart: number; wildness: number; };
}
```

`Feature.kind` being an open string is deliberate — fantasy surfaces (lava, crystal, void,
antigrav) slot in as data + a lie/physics modifier, exactly like golf-finder adds a lie by
extending `LIE_INFO`.

---

## 5. Repo structure to scaffold

```
golf-stars/
  index.html                  # Vite entry (tiny — just mounts the app)
  package.json                # vite, typescript, vitest
  vite.config.ts
  CLAUDE.md                   # the game-adapted instructions in §6 below
  src/
    sim/                      # PURE, headless, deterministic — no DOM, no globals
      rng.ts                  # seeded PRNG (mulberry32) — the only randomness source
      clubs.ts                # harvested CLUBS + clubDist/suggestClub/clubAvg
      shot.ts                 # plays-like wind + lie + shot resolution (harvested)
      score.ts                # Stableford / scoring (harvested playTotals)
      stats.ts                # harvested PLAY-STATS-CORE psAggregate
      course/
        contract.ts           # §4 interfaces
        generate.ts           # THE NEW THING — seed → Course
      rpg/
        run.ts                # travel/meta-loop state machine
        economy.ts            # currency, shop, upgrades
        loot.ts               # rarity drops (harvested RARITY_C)
    render/                   # thin — reads sim state, draws
      holeView.ts             # descendant of playHoleSvg (Canvas2D or SVG)
      cards.ts                # course/item cards (harvested buildCard + rarity)
      hud.ts
    save/
      schema.ts               # versioned blobs + migrate()
      storage.ts              # localStorage + export/import JSON
    main.ts
  art/                        # Flux-generated biome/boss/course art (gitignored source prompts kept)
  tests/                      # vitest — simulate whole runs headlessly off seeds
  .github/workflows/
    tests.yml                 # run vitest on push/PR (mirror golf-finder/tests.yml)
    pages.yml                 # build + deploy to GitHub Pages (if public)
```

---

## 6. CLAUDE.md for Golf Stars (drop in at repo root, adapt as it grows)

```markdown
# Golf Stars — working notes for Claude

A travelling space golf **RPG**. You voyage the galaxy; each stop is a procedurally-generated,
ever-wilder golf course (rarity-graded loot). Play it, earn rewards, upgrade your bag/ship/perks,
travel further as difficulty and absurdity scale. A **game**, not a tracker — its currency is
*feel, fairness, and progression*, the opposite of a realism app.

This project was seeded from `golf-finder` (a separate, real golf+astronomy PWA). We harvested its
golf simulation, rarity/card system, hole renderer, and Flux art pipeline — then cut all of its
real-world plumbing (GPS, OSM, weather, real astronomy). **The two projects are independent. Do not
re-couple them.**

## How to work with me (ground rules)
- **Pressure-test my ideas before building them.** If an idea is sound, say so and go. If it
  isn't, push back — question the premise, propose a better alternative, or say "that's not a
  great idea, Dave." A cheerful "yep!" followed by a half-working result is the worst outcome.
- **Implement properly or stop.** If you can't do something well, stop and ask for context or take
  the time to do it right. A "this can't be done cleanly because X — here's what I'd do instead"
  is always welcome.
- **Promote durable knowledge into the repo.** Memory is a private scratchpad; CLAUDE.md, skills,
  and docs are the shared record. When you learn a gotcha or recipe, write it here too.
- **Be concise, factual, accurate.** State what was verified vs. assumed.
- **Front-load everything; don't drag the session out.** Give all options in one pass; only ask a
  follow-up when the answer changes what you do — otherwise pick the sensible default and say which.

## Reports & idea backlog (living docs)
- A "report" is a **file**, committed — not a chat message (chat evaporates between sessions).
  End-of-session/one-off reports go in `reports/<topic>-YYYY-MM-DD.md`.
- Keep a living `IDEAS.md` backlog (scan, rerank, merge, retire — not append-only). Stable IDs,
  never reused. Move shipped → Done (link PR), bad → Dropped (say why).

## Three lenses (read every change through these)
This game lives or dies on three axes — put every change through all three before calling it done:
- **Game-feel designer.** The swing, the ball flight, the land, the juice. Readable power/aim,
  satisfying contact, particles and screen-shake that sell impact. Lifeless-but-correct is a bug.
  Ask: does it feel good in the hand, is the loop tight, does each run pull you to the next?
- **QA analyst.** Verify, don't assume. The sim is **pure, deterministic, headless** — so test it:
  simulate whole runs from a seed in `tests/` and assert outcomes. Reproduce any bug by its seed.
  Ship feel/physics tunables behind `window._*` escape hatches so they degrade safely and can be
  A/B'd. State what was verified vs. what needs eyes-on play.
- **Golf-soul keeper (arcade, not sim).** The golf must be *fair and readable* even when the course
  is absurd: wind that reads true off the shot bearing, lie that visibly matters, distances that
  feel honest *within the game's rules*. Wildness is the spice; an unfair or unreadable shot is a
  bug even if the physics are "right." (This is the inverse of golf-finder's realism dogma — here,
  fun and fairness beat literal accuracy.)

## Architecture (the decisions we locked up front — see STARTER-KIT for why)
- **Vite + TypeScript, modules, real test runner.** No single-file monolith.
- **Sim ↔ render split.** Everything in `src/sim/` is pure, DOM-free, deterministic, no globals —
  so Node/vitest can simulate the whole game. Rendering reads sim state; never the reverse.
- **Deterministic seeded RNG only** (`src/sim/rng.ts`). `Math.random()` is banned in the sim — it
  breaks reproducible runs, daily seeds, and test determinism.
- **Course contract** (`src/sim/course/contract.ts`) is frozen: the generator emits it, the
  renderer consumes it, the sim scores it. Rewrite either side freely behind the contract.
- **Versioned saves from v1** (`src/save/schema.ts`): every persisted blob has a `version` +
  `migrate()`. Namespace keys `gs_*`. Export/import-to-JSON exists from day one (localStorage is
  the only copy). [Lesson inherited from golf-finder's painful schema migrations.]
- **Content as data, not code:** clubs, lies, biomes, items, economy are tables the sim reads.
  New biome = new row, not an engine edit.

## Testing (regression guard)
- `tests/` (vitest) imports the pure `src/sim/` modules directly and asserts on seeded runs.
- CI: `.github/workflows/tests.yml` runs the suite on every push/PR. Keep new game logic inside
  `src/sim/` (pure) so it's reachable from tests.

## Art pipeline (Flux)
- Biome / boss-planet / course / item art is Flux-generated (`flux2_max`), text-to-image with
  styled prompts; downloaded into `art/`, lazy-loaded, runtime-cached. Same flow golf-finder used
  for night-sky art (`request_upload_url`→PUT→`generate_image`→`get_history`→download). Keep a
  prompt log so art is regenerable. Rarity tints the card/accent (`RARITY_C`).

## Change & versioning flow
- `main` is branch-protected. Each change: branch → edit → commit → push → PR → merge → sync.
- Use the GitHub MCP tools in the web environment; finish changes by shipping (PR → merge → sync).
- Commit messages explain the *why*; end with the Co-Authored-By: Claude trailer.

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind.
```

---

## 7. First-session task list (for the session scoped to golf-stars)

1. `npm create vite@latest` (vanilla-ts or your framework) → commit the skeleton.
2. Add `src/sim/rng.ts` (mulberry32) + `src/sim/course/contract.ts` (§4 types).
3. Port `src/sim/clubs.ts`, `shot.ts`, `score.ts`, `stats.ts` from the harvest manifest (§1),
   stripped of DOM and made pure.
4. Add `src/save/schema.ts` with `version:1` + a no-op `migrate()`, plus export/import JSON.
5. Stub `src/sim/course/generate.ts`: even a flat box-fairway course that satisfies the contract,
   so the renderer + sim have something to chew on end-to-end.
6. Port the hole renderer into `src/render/holeView.ts` against the contract (not OSM).
7. Wire `tests/` (vitest) — first test: generate a course from a fixed seed, simulate a scripted
   round, assert the score. Add CI `tests.yml`.
8. *Then* start the real work: the generator's wildness/biome system and the RPG meta-loop.

Build the vertical slice (1 generated hole, playable, scored, tested) before any breadth.

---

*End of starter kit. golf-finder was read only; nothing in it was changed.*
