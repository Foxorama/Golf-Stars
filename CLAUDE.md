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
